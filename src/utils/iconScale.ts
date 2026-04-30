export const ICON_SCALE_OPTIONS = ['ต้องพัก', 'เบา ๆ', 'ปกติ', 'สดชื่น', 'ฟิตมาก'];

export function isIconScaleType(type: string) {
  return type === 'icon-scale' || type === 'emoji-scale';
}

export function getScaleLabel(option: string | undefined, index: number) {
  if (option && option.trim()) {
    return option;
  }

  return ICON_SCALE_OPTIONS[index] || `ระดับ ${index + 1}`;
}