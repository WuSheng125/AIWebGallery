// 着色器源码：全屏三角形、黑洞光线追踪（测地线积分）、后处理合成
// 单位约定：史瓦西半径 rs = 1，因此 GM = 0.5，光子球位于 r = 1.5

const VERT_SRC = `#version 300 es
precision highp float;
void main() {
    // 不需要顶点缓冲：用 gl_VertexID 生成覆盖全屏的三角形
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const SCENE_FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform vec3  uCamPos, uCamRight, uCamUp, uCamFwd;
uniform float uTanHalf;
uniform float uTime;
uniform int   uSteps;
uniform vec3  uDiskN;      // 吸积盘法线，同时作为自旋轴
uniform float uSpin;       // 自旋参数 a
uniform float uInner;      // 盘内缘（已由 ISCO 决定）
uniform float uOuter;      // 盘外缘
uniform float uBright;
uniform float uT0;         // 内缘温度 (K)
uniform float uOpacity;    // 盘的单次穿越不透明度
uniform float uDoppler;    // 多普勒增亮强度
uniform float uLens;       // 偏折强度
uniform float uFrame;      // 框架拖拽强度
uniform float uStars;      // 星空密度

const float RS    = 1.0;   // 史瓦西半径
const float R_ESC = 80.0;  // 超过此半径且向外运动即视为逃逸

// ---------- 噪声 ----------
float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(hash13(i),                    hash13(i + vec3(1,0,0)), f.x),
                  mix(hash13(i + vec3(0,1,0)),      hash13(i + vec3(1,1,0)), f.x), f.y);
    float b = mix(mix(hash13(i + vec3(0,0,1)),      hash13(i + vec3(1,0,1)), f.x),
                  mix(hash13(i + vec3(0,1,1)),      hash13(i + vec3(1,1,1)), f.x), f.y);
    return mix(a, b, f.z);
}

float fbm(vec3 p) {
    float s = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
        s += amp * vnoise(p);
        p = p * 2.03 + 17.1;
        amp *= 0.5;
    }
    return s;
}

// ---------- 黑体色（Tanner Helland 拟合）----------
vec3 blackbody(float T) {
    T = clamp(T, 1000.0, 40000.0) / 100.0;
    float r, g, b;
    if (T <= 66.0) {
        r = 1.0;
        g = clamp(0.39008 * log(T) - 0.63184, 0.0, 1.0);
    } else {
        r = clamp(1.29294 * pow(T - 60.0, -0.13320), 0.0, 1.0);
        g = clamp(1.12989 * pow(T - 60.0, -0.07551), 0.0, 1.0);
    }
    if (T >= 66.0)     b = 1.0;
    else if (T <= 19.0) b = 0.0;
    else               b = clamp(0.54321 * log(T - 10.0) - 1.19625, 0.0, 1.0);
    return vec3(r, g, b);
}

// ---------- 星空 ----------
vec3 starField(vec3 d) {
    vec3 col = vec3(0.0);
    vec3 p = d * 110.0;              // 星格密度
    vec3 ip = floor(p);
    float prob = uStars * 0.12;      // 每格有星的概率
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
        vec3 cell = ip + vec3(float(x), float(y), float(z));
        float h = hash13(cell);
        if (h > prob) continue;
        vec3 c = cell + 0.1 + 0.8 * vec3(hash13(cell + 7.1), hash13(cell + 3.7), hash13(cell + 11.3));
        float dd = length(p - c);
        float mag = pow(hash13(cell + 1.3), 6.0);
        float temp = 3000.0 + 9000.0 * hash13(cell + 5.5);
        col += blackbody(temp) * exp(-dd * dd * 30.0) * (0.8 + 6.0 * mag);
    }
    return col;
}

vec3 background(vec3 d) {
    // 银河带
    vec3 gn = normalize(vec3(0.35, 1.0, 0.25));
    float band = exp(-(dot(d, gn) * 4.0) * (dot(d, gn) * 4.0));
    float dust = fbm(d * 4.0);
    vec3 mw = vec3(0.45, 0.5, 0.7) * band * (0.01 + 0.06 * dust * dust);
    return mw + starField(d);
}

// ---------- 吸积盘发光 ----------
vec3 diskEmission(vec3 hit, vec3 vN, float r) {
    vec3 n = uDiskN;
    vec3 t = abs(n.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
    vec3 e1 = normalize(cross(n, t));
    vec3 e2 = cross(n, e1);
    float phi = atan(dot(hit, e2), dot(hit, e1));

    // 开普勒差速旋转 + 湍流条纹（内圈转得快，形成螺旋拉伸）
    float omega = sqrt(0.5 / (r * r * r));
    float ph = phi + uTime * omega;
    float turb = fbm(vec3(cos(ph), sin(ph), log(r) * 1.5) * 3.0);
    float dens = 0.35 + 1.0 * turb;

    // 诺维科夫-索恩形状（归一化峰值约为 1）
    float x = uInner / r;
    float prof = 12.2 * x * x * (1.0 - sqrt(x));
    float Tr = uT0 * pow(x, 0.75);

    // 多普勒与引力红移
    float vK = min(sqrt(0.5 / max(r - RS, 0.01)), 0.8);
    float gam = 1.0 / sqrt(1.0 - vK * vK);
    vec3 vdir = normalize(cross(n, hit));              // 前向（与自旋同向）切向
    float gDop = clamp(1.0 / (gam * (1.0 - vK * dot(vdir, -vN))), 0.2, 2.5);
    float gGrav = sqrt(max(1.0 - RS / r, 0.0));
    float g = gDop * gGrav;

    vec3 bb = blackbody(Tr * g);
    float I = prof * dens * uBright * pow(gGrav, 4.0) * pow(gDop, 4.0 * uDoppler);
    return bb * I;
}

// ---------- 主光线追踪 ----------
void main() {
    vec2 uv = gl_FragCoord.xy / uRes * 2.0 - 1.0;
    uv.x *= uRes.x / uRes.y;
    vec3 dir = normalize(uCamFwd + (uv.x * uCamRight + uv.y * uCamUp) * uTanHalf);

    vec3 J = uDiskN;
    vec3 pos = uCamPos;
    vec3 vel = dir;
    float prevSide = dot(pos, uDiskN);
    vec3 col = vec3(0.0);
    float trans = 1.0;
    bool captured = false;

    for (int i = 0; i < 400; i++) {
        if (i >= uSteps) break;

        float r = length(pos);
        if (r < RS) { captured = true; break; }
        if (r > R_ESC && dot(pos, vel) > 0.0) break;

        float dt = clamp(0.05 * r, 0.015, 0.8);
        vec3 prevPos = pos;

        // 史瓦西弱场形式的光线偏折：a = -1.5 rs h² r / |r|⁵，h = |r × v|
        vec3 h = cross(pos, vel);
        float h2 = dot(h, h);
        float r2 = r * r;
        vec3 acc = -1.5 * uLens * RS * h2 * pos / (r2 * r2 * r);

        // 近似的引力磁（框架拖拽）项，正比于自旋 a
        vec3 rhat = pos / r;
        vec3 B = (3.0 * dot(J, rhat) * rhat - J) / (r2 * r);
        acc += uFrame * uSpin * cross(vel, B);

        vel = normalize(vel + acc * dt);
        pos += vel * dt;

        // 穿过吸积盘平面：线性插值求交点
        float side = dot(pos, uDiskN);
        if (side * prevSide < 0.0 && uOpacity > 0.0) {
            float f = prevSide / (prevSide - side);
            vec3 hit = mix(prevPos, pos, f);
            float rh = length(hit);
            if (rh > uInner && rh < uOuter) {
                vec3 e = diskEmission(hit, normalize(vel), rh);
                col += trans * uOpacity * e;
                trans *= (1.0 - uOpacity);
                if (trans < 0.02) { trans = 0.0; break; }
            }
        }
        prevSide = side;
    }

    if (!captured && trans > 0.0) {
        col += trans * background(normalize(vel));
    }
    fragColor = vec4(col, 1.0);
}`;

const COMP_FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uScene;
uniform vec2  uRes;        // 画布像素尺寸
uniform float uBloom;
uniform float uExposure;

// ACES 拟合色调映射
vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 c = texture(uScene, uv).rgb;
    // 利用 mipmap 做廉价的多尺度泛光
    vec3 glow = textureLod(uScene, uv, 2.0).rgb * 0.5
              + textureLod(uScene, uv, 4.0).rgb * 0.8
              + textureLod(uScene, uv, 6.0).rgb * 1.0;
    c += glow * uBloom * 0.25;
    c *= uExposure;
    c = aces(c);
    c = pow(c, vec3(1.0 / 2.2));
    fragColor = vec4(c, 1.0);
}`;
