import React from 'react';
import { Composition, Audio, staticFile, useVideoConfig, useCurrentFrame, interpolate, spring } from 'remotion';

// Audio segments with their start times (in seconds)
const AUDIO_SEGMENTS = [
  { src: staticFile('audio/seg_00.mp3'), startFrame: 0 },
  { src: staticFile('audio/seg_01.mp3'), startFrame: 150 },
  { src: staticFile('audio/seg_02.mp3'), startFrame: 300 },
  { src: staticFile('audio/seg_03.mp3'), startFrame: 450 },
  { src: staticFile('audio/seg_04.mp3'), startFrame: 600 },
  { src: staticFile('audio/seg_05.mp3'), startFrame: 750 },
  { src: staticFile('audio/seg_06.mp3'), startFrame: 960 },
  { src: staticFile('audio/seg_07.mp3'), startFrame: 1140 },
];

const COLORS = {
  bg: '#0a0a0a',
  accent: '#ff6b35',
  teal: '#2dd4bf',
  white: '#f0f0f0',
  grey: '#8b98a8',
  dark: '#1a1a2e',
  card: '#16213e',
};

// ── Intro Scene ──
const Intro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSlide = spring({ frame, fps, config: { damping: 12 } });
  const subtitleFade = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: 'clamp' });
  const logoScale = interpolate(frame, [0, 40], [0.3, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      flex: 1, background: `linear-gradient(135deg, ${COLORS.bg} 0%, #1a0a00 50%, ${COLORS.bg} 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif',
    }}>
      {/* Logo */}
      <div style={{
        transform: `scale(${logoScale})`,
        fontSize: 72, fontWeight: 900, letterSpacing: 4,
        background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.teal})`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        marginBottom: 16,
      }}>
        🏍️ 摩估
      </div>
      <div style={{
        opacity: subtitleFade, fontSize: 22, color: COLORS.grey,
        letterSpacing: 6, marginTop: 8,
      }}>
        MotoValue
      </div>
      <div style={{
        opacity: subtitleFade, fontSize: 16, color: COLORS.accent,
        marginTop: 24, letterSpacing: 2,
      }}>
        二手摩托车科学估价平台
      </div>
    </div>
  );
};

// ── Feature Card Component ──
const FeatureCard = ({ icon, title, desc, index, total }) => {
  const frame = useCurrentFrame();
  const delay = index * 15;
  const progress = spring({ frame: Math.max(0, frame - delay), fps: 30, config: { damping: 14 } });

  return (
    <div style={{
      transform: `translateY(${(1 - progress) * 60}px)`,
      opacity: progress,
      background: COLORS.card,
      borderRadius: 12, padding: '20px 24px', margin: '8px 0',
      borderLeft: `4px solid ${[COLORS.accent, COLORS.teal, '#f59e0b', '#44bb44'][index % 4]}`,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <span style={{ fontSize: 32 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.white }}>{title}</div>
        <div style={{ fontSize: 13, color: COLORS.grey, marginTop: 4 }}>{desc}</div>
      </div>
    </div>
  );
};

// ── Feature Showcase Scene ──
const Features = () => {
  const frame = useCurrentFrame();
  const titleY = spring({ frame, fps: 30, config: { damping: 12 } });

  const features = [
    { icon: '📋', title: '13年强制报废', desc: '折旧曲线主导因素，临近报废残值快速衰减' },
    { icon: '🏭', title: '排放标准', desc: '国三/国四/国二分级折价，影响过户与迁入' },
    { icon: '🏷️', title: '品牌保值梯度', desc: '本田>雅马哈>豪爵>春风>钱江，25品牌精确系数' },
    { icon: '🏍️', title: '类别差异化折旧', desc: '踏板贬值快，复古/拉力保值，8大类别校准' },
    { icon: '📄', title: '手续完整度', desc: '三证齐全/缺大绿本/抵押状态，影响过户可行性' },
    { icon: '🔄', title: '过户次数', desc: '一手未过户加价3%，多次过户明显掉价' },
    { icon: '📍', title: '区域政策', desc: '禁摩/限摩/不禁摩三档，影响本地需求与流通性' },
    { icon: '🔧', title: '车况五维评分', desc: '外观·机械·事故·改装·保养，科学量化车况' },
  ];

  return (
    <div style={{
      flex: 1, background: COLORS.bg, padding: '40px 60px',
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{
        transform: `translateY(${(1 - titleY) * -40}px)`,
        opacity: titleY,
        fontSize: 28, fontWeight: 700, color: COLORS.accent,
        marginBottom: 20, letterSpacing: 2,
      }}>
        八大科学估价因子
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {features.map((f, i) => (
          <FeatureCard key={i} {...f} index={i} total={features.length} />
        ))}
      </div>
    </div>
  );
};

// ── Database Stats Scene ──
const Database = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stats = [
    { value: '127+', label: '在售车型', delay: 10 },
    { value: '23', label: '主流品牌', delay: 25 },
    { value: '8', label: '车型类别', delay: 40 },
    { value: '实时', label: '价格更新', delay: 55 },
  ];

  return (
    <div style={{
      flex: 1, background: `linear-gradient(180deg, ${COLORS.bg} 0%, #0d1b2a 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif', padding: 40,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.teal, marginBottom: 30, letterSpacing: 2 }}>
        覆盖中国大陆主流品牌
      </div>
      <div style={{ display: 'flex', gap: 40 }}>
        {stats.map((s, i) => {
          const p = spring({ frame: Math.max(0, frame - s.delay), fps, config: { damping: 10 } });
          return (
            <div key={i} style={{
              transform: `scale(${p})`, opacity: p,
              textAlign: 'center', background: COLORS.card, borderRadius: 16,
              padding: '24px 32px', minWidth: 120,
            }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: COLORS.accent }}>{s.value}</div>
              <div style={{ fontSize: 14, color: COLORS.grey, marginTop: 8 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{
        marginTop: 30, fontSize: 14, color: COLORS.grey, maxWidth: 500, textAlign: 'center',
        lineHeight: 1.8,
      }}>
        本田·川崎·宝马·凯旋·雅马哈·哈雷·KTM<br/>
        春风·钱江·无极·凯越·豪爵·升仕·张雪机车<br/>
        新大洲本田·济南铃木·宗申·阿普利亚·比亚乔·凯威MBP·高金·Lambretta
      </div>
    </div>
  );
};

// ── Desktop Pet Scene ──
const Desktop = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const items = [
    { icon: '🖱️', text: '右键桌面宠物 → 唤醒菜单' },
    { icon: '💰', text: 'Motorcycle Valuation — 手动估价' },
    { icon: '🏍️', text: 'Refresh Moto Database — 刷新数据库' },
    { icon: '🌐', text: 'Open Moto Value Web — 打开网页版' },
  ];

  return (
    <div style={{
      flex: 1, background: `linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif', padding: 40,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.accent, marginBottom: 30, letterSpacing: 2 }}>
        🖥️ 桌面宠物一键触达
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 400 }}>
        {items.map((item, i) => {
          const delay = 10 + i * 20;
          const x = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 14 } });
          return (
            <div key={i} style={{
              transform: `translateX(${(1 - x) * 80}px)`, opacity: x,
              display: 'flex', alignItems: 'center', gap: 16,
              background: COLORS.card, borderRadius: 10, padding: '14px 20px',
            }}>
              <span style={{ fontSize: 28 }}>{item.icon}</span>
              <span style={{ fontSize: 15, color: COLORS.white }}>{item.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Web + Xianyu Scene ──
const WebCompare = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const steps = [
    { text: '选择车型 + 填写车况 → 科学估价', color: COLORS.accent, delay: 10 },
    { text: '闲鱼行情比价 → 一键对比市场价', color: COLORS.teal, delay: 35 },
    { text: '定价有据可依 → 买家卖家都放心', color: '#44bb44', delay: 60 },
  ];

  return (
    <div style={{
      flex: 1, background: COLORS.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif', padding: 40,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.accent, marginBottom: 36, letterSpacing: 2 }}>
        🌐 网页版 + 闲鱼比价
      </div>
      {steps.map((s, i) => {
        const p = spring({ frame: Math.max(0, frame - s.delay), fps, config: { damping: 12 } });
        return (
          <div key={i} style={{
            transform: `scale(${0.8 + 0.2 * p})`, opacity: p,
            fontSize: 20, fontWeight: 600, color: s.color,
            marginBottom: 20, letterSpacing: 1,
          }}>
            {i + 1}. {s.text}
          </div>
        );
      })}
    </div>
  );
};

// ── Outro Scene ──
const Outro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const sloganY = spring({ frame: Math.max(0, frame - 20), fps, config: { damping: 10 } });

  return (
    <div style={{
      flex: 1, background: `linear-gradient(135deg, ${COLORS.bg} 0%, #1a0a00 50%, ${COLORS.bg} 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif',
    }}>
      <div style={{ opacity: textOpacity, fontSize: 40, fontWeight: 900, color: COLORS.accent, letterSpacing: 4, marginBottom: 20 }}>
        摩 估
      </div>
      <div style={{
        transform: `translateY(${(1 - sloganY) * 30}px)`, opacity: sloganY,
        fontSize: 20, color: COLORS.teal, letterSpacing: 2,
      }}>
        让二手摩托车交易回归科学
      </div>
    </div>
  );
};

// ── Root Composition ──
const SCENE_DURATIONS = [150, 150, 150, 150, 150, 210, 150]; // frames per scene (at 30fps)
const TOTAL_FRAMES = SCENE_DURATIONS.reduce((a, b) => a + b, 0); // ~45s

const SceneSwitcher = () => {
  const frame = useCurrentFrame();
  let offset = 0;
  const scenes = [Intro, Features, Database, Desktop, WebCompare, Outro];

  for (let i = 0; i < scenes.length; i++) {
    const dur = SCENE_DURATIONS[i];
    if (frame < offset + dur) {
      const Scene = scenes[i];
      return (
        <div style={{ flex: 1, display: 'flex' }}>
          <Scene />
          {/* Scene transition overlay */}
          {frame - offset < 20 && (
            <div style={{
              position: 'absolute', inset: 0,
              background: `rgba(0,0,0,${1 - (frame - offset) / 20})`,
            }} />
          )}
        </div>
      );
    }
    offset += dur;
  }
  return <Outro />;
};

export const MotoValueVideo = () => {
  return (
    <div style={{ flex: 1, display: 'flex', backgroundColor: COLORS.bg, position: 'relative' }}>
      {/* Audio */}
      {AUDIO_SEGMENTS.map((seg, i) => (
        seg.src ? <Audio key={i} src={seg.src} startFrom={seg.startFrame} /> : null
      ))}
      <SceneSwitcher />
    </div>
  );
};

export const Root = () => {
  return (
    <Composition
      id="MotoValueIntro"
      component={MotoValueVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
