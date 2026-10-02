import fredoka700 from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff2?url';

/** 本地加载 Fredoka Bold(来自 @fontsource/fredoka,随构建打包,不依赖外网 CDN)。 */
export async function loadFonts(): Promise<void> {
  try {
    const ff = new FontFace('Fredoka', `url(${fredoka700}) format("woff2")`, { weight: '700', style: 'normal' });
    await ff.load();
    document.fonts.add(ff);
  } catch (e) {
    console.warn('[fonts] Fredoka 加载失败,退回系统字体', e);
  }
}
