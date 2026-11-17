import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { BlackHoleRenderer } from './renderer/BlackHoleRenderer';
import {
  BlackHoleParams,
  DEFAULT_CAMERA,
  DEFAULT_PARAMS,
  PhysicsTelemetry,
  ScenePreset,
  computeEventHorizonRs,
  computeKerrIscoRs,
  computePhotonSphereRs,
} from './types/blackHole';

export const App: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BlackHoleRenderer | null>(null);

  const [params, setParams] = useState<BlackHoleParams>(DEFAULT_PARAMS);
  const [activePresetId, setActivePresetId] = useState<string>('gargantua');
  const [hudHidden, setHudHidden] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<PhysicsTelemetry>(() => ({
    schwarzschildRadius: DEFAULT_PARAMS.mass,
    eventHorizonRadius:
      computeEventHorizonRs(DEFAULT_PARAMS.spin) * DEFAULT_PARAMS.mass,
    photonSphereRadius:
      computePhotonSphereRs(DEFAULT_PARAMS.spin) * DEFAULT_PARAMS.mass,
    iscoRadius: computeKerrIscoRs(DEFAULT_PARAMS.spin) * DEFAULT_PARAMS.mass,
    shadowRadius: 2.598 * DEFAULT_PARAMS.mass,
    observerDistance: DEFAULT_CAMERA.distance,
    fps: 60,
  }));

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    const renderer = new BlackHoleRenderer(container, DEFAULT_PARAMS, {
      onTelemetry: (nextTelemetry) => setTelemetry(nextTelemetry),
      onRollChange: (newRollDeg) => {
        setParams((prev) => ({ ...prev, cameraRoll: newRollDeg }));
      },
    });
    engineRef.current = renderer;

    return () => {
      renderer.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.updateParams(params);
  }, [params]);

  const handleParamsChange = useCallback((patch: Partial<BlackHoleParams>) => {
    setActivePresetId('custom');
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSelectPreset = useCallback((preset: ScenePreset) => {
    setActivePresetId(preset.id);
    setParams((prev) => {
      const merged: BlackHoleParams = {
        ...prev,
        ...preset.params,
      };
      if (merged.autoIsco) {
        merged.diskInner = computeKerrIscoRs(merged.spin);
      }
      return merged;
    });
    if (preset.camera) {
      engineRef.current?.setCameraState(preset.camera, false);
    }
  }, []);

  const handleResetCamera = useCallback(() => {
    engineRef.current?.resetCamera();
    setParams((prev) => ({ ...prev, cameraRoll: DEFAULT_PARAMS.cameraRoll }));
  }, []);

  const handleCaptureScreenshot = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const dataUrl = engine.captureScreenshot();
    const link = document.createElement('a');
    link.download = `gargantua-${activePresetId}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }, [activePresetId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setParams((prev) => ({ ...prev, paused: !prev.paused }));
      } else if (e.key === 'h' || e.key === 'H') {
        setHudHidden((h) => !h);
      } else if (e.key === 'r' || e.key === 'R') {
        handleResetCamera();
      } else if (e.key === 'o' || e.key === 'O') {
        setParams((prev) => ({ ...prev, autoOrbit: !prev.autoOrbit }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleResetCamera]);

  return (
    <main className="app-shell">
      <div
        ref={viewportRef}
        className="webgl-viewport"
        aria-label="卡冈图雅黑洞三维交互式引力透镜视窗"
      />
      <ControlPanel
        params={params}
        activePresetId={activePresetId}
        telemetry={telemetry}
        hudHidden={hudHidden}
        onChange={handleParamsChange}
        onSelectPreset={handleSelectPreset}
        onResetCamera={handleResetCamera}
        onCaptureScreenshot={handleCaptureScreenshot}
        onToggleHud={() => setHudHidden((h) => !h)}
      />
    </main>
  );
};

export default App;
