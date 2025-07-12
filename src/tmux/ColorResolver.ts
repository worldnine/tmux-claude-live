import type { ProcessedData } from '../core/DataProcessor'

export type ColorLevel = 'normal' | 'warning' | 'danger' | 'inactive'

export interface CustomColors {
  normal?: string
  warning?: string
  danger?: string
  inactive?: string
}

export class ColorResolver {
  private static readonly DEFAULT_COLORS = {
    normal: 'colour2',   // 緑
    warning: 'colour3',  // 黄
    danger: 'colour1',   // 赤
    inactive: 'colour8'  // グレー
  }

  private static readonly COLOR_NAMES: Record<string, string> = {
    colour1: 'red',
    colour2: 'green',
    colour3: 'yellow',
    colour8: 'grey'
  }

  private static readonly VALID_COLOR_NAMES = [
    'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'black'
  ]

  static resolveWarningColor(level: 'normal' | 'warning' | 'danger'): string {
    switch (level) {
      case 'normal':
        return this.DEFAULT_COLORS.normal
      case 'warning':
        return this.DEFAULT_COLORS.warning
      case 'danger':
        return this.DEFAULT_COLORS.danger
      default:
        return this.DEFAULT_COLORS.normal
    }
  }

  static resolveColorFromUsage(usagePercent: number): string {
    if (usagePercent >= 90) {
      return this.DEFAULT_COLORS.danger
    } else if (usagePercent >= 70) {
      return this.DEFAULT_COLORS.warning
    } else {
      return this.DEFAULT_COLORS.normal
    }
  }

  static resolveColorFromTimeRemaining(remainingMinutes: number): string {
    if (remainingMinutes <= 30) {
      return this.DEFAULT_COLORS.danger
    } else if (remainingMinutes <= 60) {
      return this.DEFAULT_COLORS.warning
    } else {
      return this.DEFAULT_COLORS.normal
    }
  }

  static resolveColorFromCombinedFactors(usagePercent: number, remainingMinutes: number): string {
    const usageColor = this.resolveColorFromUsage(usagePercent)
    const timeColor = this.resolveColorFromTimeRemaining(remainingMinutes)
    
    // より厳しい方を採用
    if (usageColor === this.DEFAULT_COLORS.danger || timeColor === this.DEFAULT_COLORS.danger) {
      return this.DEFAULT_COLORS.danger
    } else if (usageColor === this.DEFAULT_COLORS.warning || timeColor === this.DEFAULT_COLORS.warning) {
      return this.DEFAULT_COLORS.warning
    } else {
      return this.DEFAULT_COLORS.normal
    }
  }

  static resolveColorFromProcessedData(data: ProcessedData): string {
    if (!data.isActive) {
      return this.DEFAULT_COLORS.inactive
    }
    
    return this.resolveWarningColor(data.warningLevel)
  }

  static getColorName(tmuxColor: string): string {
    return this.COLOR_NAMES[tmuxColor] || 'default'
  }

  static resolveCustomColor(level: ColorLevel, customColors?: CustomColors): string {
    if (customColors && customColors[level]) {
      return customColors[level]!
    }
    
    return this.DEFAULT_COLORS[level] || this.DEFAULT_COLORS.normal
  }

  static isValidTmuxColor(color: string): boolean {
    if (!color || color.trim() === '') {
      return false
    }
    
    // 色名チェック
    if (this.VALID_COLOR_NAMES.includes(color)) {
      return true
    }
    
    // colour0-colour255形式チェック
    const colourMatch = color.match(/^colour(\d+)$/)
    if (colourMatch) {
      const num = parseInt(colourMatch[1])
      return num >= 0 && num <= 255
    }
    
    // 16進数カラーチェック
    const hexMatch = color.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    if (hexMatch) {
      return true
    }
    
    return false
  }
}