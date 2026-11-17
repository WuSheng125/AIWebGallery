import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Compass,
  Eye,
  EyeOff,
  Flame,
  Orbit,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  BlackHoleParams,
  PhysicsTelemetry,
  RenderQuality,
  SCENE_PRESETS,
  ScenePreset,
  computeKerrIscoRs,
} from '../types/blackHole';

interface ControlPanelProps {
  params: BlackHoleParams;
  activePresetId: string;
  telemetry: PhysicsTelemetry;
  hudHidden: boolean;
  onChange: (patch: Partial<BlackHoleParams>) => void;
  onSelectPreset: (preset: ScenePreset) => void;
  onResetCamera: () => void;
  onCaptureScreenshot: () => void;
  onToggleHud: () => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  hint?: string;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  decimals = 2,
  disabled = false,
  hint,
  onChange,
}) => {
  const percent = Math.max(
    0,
    Math.min(100, ((value - min) / Math.max(1e-6, max - min)) * 100)
  );

  return (
    <div className={`control-row ${disabled ? 'is-disabled' : ''}`}>
      <div className="control-row-header">
        <span className="control-label">
          {label}
          {hint && <small className="control-hint">{hint}</small>}
        </span>
        <span className="control-value">
          {value.toFixed(decimals)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        className="gargantua-slider"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        style={{ '--fill-pct': `${percent}%` } as React.CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
};

interface ToggleRowProps {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  sublabel,
  checked,
  onChange,
}) => (
  <div className="toggle-row" onClick={() => onChange(!checked)}>
    <div className="toggle-text">
      <span className="control-label">{label}</span>
      {sublabel && <small className="control-sublabel">{sublabel}</small>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle-switch ${checked ? 'is-on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <span className="toggle-thumb" />
    </button>
  </div>
);

export const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  activePresetId,
  telemetry,
  hudHidden,
  onChange,
  onSelectPreset,
  onResetCamera,
  onCaptureScreenshot,
  onToggleHud,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    presets: true,
    spacetime: true,
    disk: true,
    optics: true,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const effectiveIsco = computeKerrIscoRs(params.spin);

  if (hudHidden) {
    return (
      <div className="floating-restore-bar">
        <button
          type="button"
          className="hud-icon-btn"
          title="显示控制面板与观测界面 (快捷键 H)"
          onClick={onToggleHud}
        >
          <Eye size={16} />
          <span>显示观测台</span>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Top-Left Observatory Header & Relativistic Telemetry */}
      <header className="observatory-badge">
        <div className="badge-title-row">
          <span className="badge-dot" />
          <span className="badge-kicker">ENDURANCE DEEP-SPACE OPTICS</span>
        </div>
        <h1 className="badge-heading">GARGANTUA · 卡冈图雅</h1>
        <p className="badge-desc">
          克尔弯曲时空测地线实时光线追踪 · 相对论吸积盘与强引力透镜模拟
        </p>

        <div className="telemetry-grid">
          <div className="telemetry-cell">
            <span className="telemetry-key">视界半径 r₊</span>
            <span className="telemetry-val">
              {telemetry.eventHorizonRadius.toFixed(2)} rₛ
            </span>
          </div>
          <div className="telemetry-cell">
            <span className="telemetry-key">光子球 r_ph</span>
            <span className="telemetry-val">
              {telemetry.photonSphereRadius.toFixed(2)} rₛ
            </span>
          </div>
          <div className="telemetry-cell">
            <span className="telemetry-key">最内稳定轨道</span>
            <span className="telemetry-val">
              {telemetry.iscoRadius.toFixed(2)} rₛ
            </span>
          </div>
          <div className="telemetry-cell">
            <span className="telemetry-key">观测距离 / 帧率</span>
            <span className="telemetry-val">
              {telemetry.observerDistance.toFixed(1)} rₛ · {telemetry.fps} FPS
            </span>
          </div>
        </div>
      </header>

      {/* Bottom-Left Camera Interaction Guide */}
      <div className="interaction-hint-bar">
        <span>左键拖拽：360° 环绕黑洞</span>
        <span className="hint-sep">·</span>
        <span>滚轮：缩放观测距离</span>
        <span className="hint-sep">·</span>
        <span>右键 / Shift+拖拽：旋转镜头倾角</span>
        <span className="hint-sep">·</span>
        <span>H：隐藏界面</span>
      </div>

      {/* Right Parameter Sidebar */}
      <aside className={`sidebar-panel ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="sidebar-top-bar">
          <div className="sidebar-brand">
            <Sliders size={15} className="accent-icon" />
            <span>引力场与光学参数台</span>
          </div>
          <div className="sidebar-actions">
            <button
              type="button"
              className={`mini-action-btn ${params.autoOrbit ? 'is-active' : ''}`}
              title="自动环绕轨道巡航 (快捷键 O)"
              onClick={() => onChange({ autoOrbit: !params.autoOrbit })}
            >
              <RefreshCw size={13} />
            </button>
            <button
              type="button"
              className="mini-action-btn"
              title={params.paused ? '继续吸积盘演化 (空格)' : '暂停吸积盘演化 (空格)'}
              onClick={() => onChange({ paused: !params.paused })}
            >
              {params.paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              type="button"
              className="mini-action-btn"
              title="保存纯净无水印剧照 PNG"
              onClick={onCaptureScreenshot}
            >
              <Camera size={14} />
            </button>
            <button
              type="button"
              className="mini-action-btn"
              title="重置相机视角 (快捷键 R)"
              onClick={onResetCamera}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              className="mini-action-btn"
              title="纯净电影观赏模式 (快捷键 H)"
              onClick={onToggleHud}
            >
              <EyeOff size={14} />
            </button>
            <button
              type="button"
              className="mini-action-btn"
              title={collapsed ? '展开参数面板' : '收起参数面板'}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? (
                <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} />
              ) : (
                <ChevronDown size={15} />
              )}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="sidebar-scroll-body">
            {/* Section 1: Scene Presets */}
            <section className="param-section">
              <button
                type="button"
                className="section-header-btn"
                onClick={() => toggleSection('presets')}
              >
                <span className="section-title">
                  <Sparkles size={14} />
                  经典天体预设
                </span>
                {openSections.presets ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
              {openSections.presets && (
                <div className="preset-list">
                  {SCENE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`preset-card ${
                        activePresetId === preset.id ? 'is-active' : ''
                      }`}
                      onClick={() => onSelectPreset(preset)}
                    >
                      <span className="preset-name">{preset.name}</span>
                      <span className="preset-sub">{preset.subtitle}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Section 2: Black Hole Spacetime & Lensing */}
            <section className="param-section">
              <button
                type="button"
                className="section-header-btn"
                onClick={() => toggleSection('spacetime')}
              >
                <span className="section-title">
                  <Orbit size={14} />
                  时空度规与引力透镜
                </span>
                {openSections.spacetime ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
              {openSections.spacetime && (
                <div className="section-controls">
                  <SliderRow
                    label="黑洞质量尺度 (rₛ)"
                    value={params.mass}
                    min={0.5}
                    max={1.9}
                    step={0.01}
                    unit="×"
                    onChange={(v) => onChange({ mass: v })}
                  />
                  <SliderRow
                    label="克尔自旋参数 (a*)"
                    hint="正值顺行，负值逆行"
                    value={params.spin}
                    min={-0.99}
                    max={0.99}
                    step={0.01}
                    onChange={(v) =>
                      onChange({
                        spin: v,
                        ...(params.autoIsco
                          ? { diskInner: computeKerrIscoRs(v) }
                          : {}),
                      })
                    }
                  />
                  <SliderRow
                    label="引力透镜弯折强度"
                    hint="1.00 = 广义相对论"
                    value={params.lensingStrength}
                    min={0.0}
                    max={1.8}
                    step={0.01}
                    unit="GR"
                    onChange={(v) => onChange({ lensingStrength: v })}
                  />
                  <ToggleRow
                    label="自动环绕巡航视角"
                    sublabel="平滑环绕黑洞动态展示背景星群透镜形变"
                    checked={params.autoOrbit}
                    onChange={(v) => onChange({ autoOrbit: v })}
                  />
                </div>
              )}
            </section>

            {/* Section 3: Relativistic Accretion Disk */}
            <section className="param-section">
              <button
                type="button"
                className="section-header-btn"
                onClick={() => toggleSection('disk')}
              >
                <span className="section-title">
                  <Flame size={14} />
                  相对论吸积盘结构
                </span>
                {openSections.disk ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
              {openSections.disk && (
                <div className="section-controls">
                  <ToggleRow
                    label="启用吸积盘辐射"
                    sublabel="关闭后可单独观察恒星爱因斯坦环"
                    checked={params.showDisk}
                    onChange={(v) => onChange({ showDisk: v })}
                  />
                  {params.showDisk && (
                    <>
                      <ToggleRow
                        label="自旋耦合内缘轨道 (ISCO)"
                        sublabel={`当前理论内缘: ${effectiveIsco.toFixed(2)} rₛ`}
                        checked={params.autoIsco}
                        onChange={(v) =>
                          onChange({
                            autoIsco: v,
                            ...(v ? { diskInner: effectiveIsco } : {}),
                          })
                        }
                      />
                      <SliderRow
                        label="吸积盘内缘半径"
                        value={
                          params.autoIsco ? effectiveIsco : params.diskInner
                        }
                        min={0.65}
                        max={4.5}
                        step={0.02}
                        unit="rₛ"
                        disabled={params.autoIsco}
                        onChange={(v) => onChange({ diskInner: v })}
                      />
                      <SliderRow
                        label="吸积盘外缘半径"
                        value={params.diskOuter}
                        min={4.2}
                        max={13.8}
                        step={0.1}
                        unit="rₛ"
                        decimals={1}
                        onChange={(v) => onChange({ diskOuter: v })}
                      />
                      <SliderRow
                        label="黑体峰值色温"
                        hint="赤金余烬 → 暖金 → 电蓝等离子"
                        value={params.diskTemperature}
                        min={2600}
                        max={17000}
                        step={100}
                        unit="K"
                        decimals={0}
                        onChange={(v) => onChange({ diskTemperature: v })}
                      />
                      <SliderRow
                        label="等离子体光深密度"
                        value={params.diskDensity}
                        min={0.25}
                        max={2.3}
                        step={0.02}
                        onChange={(v) => onChange({ diskDensity: v })}
                      />
                      <SliderRow
                        label="盘面垂直几何厚度"
                        value={params.diskThickness}
                        min={0.03}
                        max={0.34}
                        step={0.005}
                        unit="rₛ"
                        decimals={3}
                        onChange={(v) => onChange({ diskThickness: v })}
                      />
                      <SliderRow
                        label="差动开普勒旋转速度"
                        value={params.diskSpeed}
                        min={0.0}
                        max={2.5}
                        step={0.05}
                        unit="×"
                        onChange={(v) => onChange({ diskSpeed: v })}
                      />
                      <SliderRow
                        label="多普勒相对论聚束"
                        hint="0.34 电影感 / 1.0 强蓝移"
                        value={params.dopplerBeaming}
                        min={0.0}
                        max={1.0}
                        step={0.01}
                        onChange={(v) => onChange({ dopplerBeaming: v })}
                      />
                      <SliderRow
                        label="视界临界光子环增强"
                        hint="多重绕射光子球亮环"
                        value={params.photonRingBoost}
                        min={0.0}
                        max={2.0}
                        step={0.05}
                        unit="×"
                        onChange={(v) => onChange({ photonRingBoost: v })}
                      />
                      <ToggleRow
                        label="引力红移效应"
                        sublabel="近视界光子引力势频移衰减"
                        checked={params.gravRedshift}
                        onChange={(v) => onChange({ gravRedshift: v })}
                      />
                    </>
                  )}
                </div>
              )}
            </section>

            {/* Section 4: Background Cosmos & IMAX Optics */}
            <section className="param-section">
              <button
                type="button"
                className="section-header-btn"
                onClick={() => toggleSection('optics')}
              >
                <span className="section-title">
                  <Compass size={14} />
                  星空背景与电影光学
                </span>
                {openSections.optics ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
              {openSections.optics && (
                <div className="section-controls">
                  <SliderRow
                    label="背景恒星密度与亮度"
                    value={params.starDensity}
                    min={0.0}
                    max={2.4}
                    step={0.05}
                    onChange={(v) => onChange({ starDensity: v })}
                  />
                  <SliderRow
                    label="银河星云与尘埃带"
                    value={params.nebulaIntensity}
                    min={0.0}
                    max={2.0}
                    step={0.05}
                    onChange={(v) => onChange({ nebulaIntensity: v })}
                  />
                  <SliderRow
                    label="HDR 光学辉光 (Bloom)"
                    value={params.bloomStrength}
                    min={0.0}
                    max={1.8}
                    step={0.02}
                    onChange={(v) => onChange({ bloomStrength: v })}
                  />
                  <SliderRow
                    label="IMAX 宽银幕横向眩光"
                    value={params.anamorphicFlare}
                    min={0.0}
                    max={1.4}
                    step={0.02}
                    onChange={(v) => onChange({ anamorphicFlare: v })}
                  />
                  <SliderRow
                    label="胶片色调曝光度"
                    value={params.exposure}
                    min={0.45}
                    max={2.0}
                    step={0.02}
                    onChange={(v) => onChange({ exposure: v })}
                  />
                  <SliderRow
                    label="镜头倾角滚转 (Roll)"
                    value={params.cameraRoll}
                    min={-60}
                    max={60}
                    step={0.5}
                    unit="°"
                    decimals={1}
                    onChange={(v) => onChange({ cameraRoll: v })}
                  />
                  <SliderRow
                    label="光学视场角 (FOV)"
                    value={params.fov}
                    min={28}
                    max={75}
                    step={1}
                    unit="°"
                    decimals={0}
                    onChange={(v) => onChange({ fov: v })}
                  />

                  <div className="quality-row">
                    <span className="control-label">光线追踪采样精度</span>
                    <div className="quality-segmented">
                      {(
                        [
                          ['performance', '流畅'],
                          ['balanced', '均衡'],
                          ['ultra', '极致'],
                        ] as [RenderQuality, string][]
                      ).map(([qKey, qLabel]) => (
                        <button
                          key={qKey}
                          type="button"
                          className={`quality-btn ${
                            params.quality === qKey ? 'is-active' : ''
                          }`}
                          onClick={() => onChange({ quality: qKey })}
                        >
                          {qLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </aside>
    </>
  );
};
