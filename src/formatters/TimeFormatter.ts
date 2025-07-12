export type TimeFormat = 'compact' | 'verbose' | 'short'

export class TimeFormatter {
  static format(minutes: number, format: TimeFormat = 'compact'): string {
    const normalizedMinutes = Math.max(0, Math.floor(minutes))
    
    switch (format) {
      case 'compact':
        return this.formatCompact(normalizedMinutes)
      case 'verbose':
        return this.formatVerbose(normalizedMinutes)
      case 'short':
        return this.formatShort(normalizedMinutes)
      default:
        return this.formatCompact(normalizedMinutes)
    }
  }

  static formatSeconds(seconds: number): string {
    const minutes = Math.round(seconds / 60)
    return this.format(minutes, 'compact')
  }

  static parseHoursAndMinutes(timeString: string): number {
    try {
      const hourMatch = timeString.match(/(\d+)h/)
      const minuteMatch = timeString.match(/(\d+)m/)
      
      const hours = hourMatch ? parseInt(hourMatch[1]) : 0
      const minutes = minuteMatch ? parseInt(minuteMatch[1]) : 0
      
      return hours * 60 + minutes
    } catch (error) {
      return 0
    }
  }

  private static formatCompact(minutes: number): string {
    if (minutes === 0) return '0m'
    
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    
    if (hours === 0) {
      return `${remainingMinutes}m`
    }
    
    return `${hours}h${remainingMinutes}m`
  }

  private static formatVerbose(minutes: number): string {
    if (minutes === 0) return '0 minutes'
    
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    
    let result = ''
    
    if (hours > 0) {
      result += `${hours} hour${hours === 1 ? '' : 's'}`
      if (remainingMinutes > 0) {
        result += ` ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`
      } else {
        result += ' 0 minutes'
      }
    } else {
      result = `${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`
    }
    
    return result
  }

  private static formatShort(minutes: number): string {
    if (minutes === 0) return '0m'
    
    if (minutes < 60) {
      return `${minutes}m`
    }
    
    // Round to nearest hour for short format
    const hours = Math.round(minutes / 60)
    return `${hours}h`
  }
}