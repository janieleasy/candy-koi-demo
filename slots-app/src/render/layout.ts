/** 逻辑画布 1080×1920 与各区域坐标(参考 wireframe-portrait.png + assets/README §6)。 */
export const W = 1080;
export const H = 1920;

/** reel-frame 左上(1020×800) */
export const FRAME = { x: 30, y: 400, w: 1020, h: 800 };
/** 转轴窗口(相对 reel-frame:x=10,y=90,w=1000,h=620) → 绝对 */
export const WINDOW = { x: FRAME.x + 10, y: FRAME.y + 90, w: 1000, h: 620 };
/** reel-bg 放在窗口内 x=-3(1006 宽,左右各 3px 被金边盖住) */
export const REEL_BG = { x: WINDOW.x - 3, y: WINDOW.y, w: 1006, h: 620 };

/** 格心相对 reel-bg 左上:(95+204c, 95+215r)。下面给出相对「窗口」的格心(= reel-bg 偏移 -3)。 */
export const PITCH_X = 204;
export const PITCH_Y = 215;
export const CELL = 190;
export const SYMBOL_SIZE = 165;
export const SYMBOL_SCALE = SYMBOL_SIZE / 256; // 纹理逻辑尺寸 256(合图 meta.scale=2)
export const SYMBOL_DY = 2;                    // 格心再下移 2px
export const COLS = 5;
export const ROWS = 3;

/** 相对 reel-bg 左上的格心 */
export const cellCenterInBg = (c: number, r: number) => ({ x: 95 + PITCH_X * c, y: 95 + PITCH_Y * r });
/** 相对窗口(符号层/mask 坐标系)的格心 */
export const cellCenterInWindow = (c: number, r: number) => {
  const p = cellCenterInBg(c, r);
  return { x: p.x + (REEL_BG.x - WINDOW.x), y: p.y };
};
/** 舞台绝对坐标的格心 */
export const cellCenterAbs = (c: number, r: number) => {
  const p = cellCenterInBg(c, r);
  return { x: REEL_BG.x + p.x, y: REEL_BG.y + p.y };
};

/** 其他舞台元素 */
export const LOGO = { x: 540, y: 148, scale: 0.36 };      // logo 800×330
export const BAND_Y = 215;                                  // 奖池 / FS 计数带 215..385
export const WIN_BAR = { x: 90, y: 1190, w: 900, h: 150 }; // 数字槽中心 (450,66)
export const WIN_SLOT = { x: WIN_BAR.x + 450, y: WIN_BAR.y + 66 };

/** DOM 底部 UI */
export const ROW_PANELS_Y = 1352;
export const SPIN = { x: 540, y: 1660 };
export const AUTO = { x: 235, y: 1660 };
export const TURBO = { x: 845, y: 1660 };
export const INFO = { x: 80, y: 1575 };
export const SOUND = { x: 80, y: 1745 };
export const MENU = { x: 1000, y: 1575 };
