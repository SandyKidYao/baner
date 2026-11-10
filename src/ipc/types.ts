export interface Block {
  id: string;
  key: string;
  text: string;
}

export interface TabMeta {
  id: string;
  name: string;
  /** 轨道上显示的单字 */
  glyph: string;
  key: string;
}
