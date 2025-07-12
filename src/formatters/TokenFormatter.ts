export type TokenFormat = 'compact' | 'full' | 'short'

export class TokenFormatter {
  static format(tokens: number, format: TokenFormat = 'compact'): string {
    const normalizedTokens = Math.max(0, tokens)
    
    switch (format) {
      case 'compact':
        return this.formatCompact(normalizedTokens)
      case 'full':
        return this.formatFull(Math.round(normalizedTokens))
      case 'short':
        return this.formatShort(normalizedTokens)
      default:
        return this.formatCompact(normalizedTokens)
    }
  }

  static formatWithUnit(tokens: number, singularUnit: string, pluralUnit?: string): string {
    const formattedTokens = this.format(tokens, 'compact')
    const unit = tokens === 1 ? singularUnit : (pluralUnit || singularUnit)
    return `${formattedTokens} ${unit}`
  }

  static parseTokenString(tokenString: string): number {
    try {
      if (!tokenString || tokenString.trim() === '') return 0
      
      const lowerString = tokenString.toLowerCase()
      
      // Handle k, M, B suffixes first (but only if they're unit suffixes, not in words)
      if (lowerString.match(/\d+\.?\d*\s*k(\s|$)/)) {
        const cleanString = tokenString.replace(/\s*(tokens?|k)\s*/gi, '').replace(/,/g, '')
        const num = parseFloat(cleanString)
        return isNaN(num) ? 0 : Math.floor(num * 1000)
      }
      
      if (lowerString.match(/\d+\.?\d*\s*m(\s|$)/)) {
        const cleanString = tokenString.replace(/\s*(tokens?|m)\s*/gi, '').replace(/,/g, '')
        const num = parseFloat(cleanString)
        return isNaN(num) ? 0 : Math.floor(num * 1000000)
      }
      
      if (lowerString.match(/\d+\.?\d*\s*b(\s|$)/)) {
        const cleanString = tokenString.replace(/\s*(tokens?|b)\s*/gi, '').replace(/,/g, '')
        const num = parseFloat(cleanString)
        return isNaN(num) ? 0 : Math.floor(num * 1000000000)
      }
      
      // Plain number (remove 'tokens' but not k/M/B)
      const cleanString = tokenString.replace(/\s*tokens?\s*/gi, '').replace(/,/g, '')
      const num = parseFloat(cleanString)
      return isNaN(num) ? 0 : Math.floor(num)
    } catch (error) {
      return 0
    }
  }

  static getUsageDescription(tokens: number, limit: number): string {
    const usage = tokens / limit
    
    if (tokens > limit) return 'Over limit'
    if (tokens === limit) return 'At limit'
    if (usage >= 0.7) return 'Heavy usage'
    if (usage >= 0.3) return 'Moderate usage'
    return 'Light usage'
  }

  private static formatCompact(tokens: number): string {
    if (tokens === 0) return '0'
    if (tokens < 1000) return Math.floor(tokens).toString()
    
    if (tokens < 1000000) {
      const k = tokens / 1000
      return k % 1 === 0 && k >= 100 ? `${k}k` : `${k.toFixed(1)}k`
    }
    
    if (tokens < 1000000000) {
      const m = tokens / 1000000
      return m % 1 === 0 && m >= 100 ? `${m}M` : `${m.toFixed(1)}M`
    }
    
    const b = tokens / 1000000000
    return b % 1 === 0 && b >= 100 ? `${b}B` : `${b.toFixed(1)}B`
  }

  private static formatFull(tokens: number): string {
    if (tokens === 0) return '0'
    return tokens.toLocaleString()
  }

  private static formatShort(tokens: number): string {
    if (tokens === 0) return '0'
    if (tokens < 1000) return tokens.toString()
    
    if (tokens < 1000000) {
      const k = Math.round(tokens / 1000)
      return `${k}k`
    }
    
    if (tokens < 1000000000) {
      const m = Math.round(tokens / 1000000)
      return `${m}M`
    }
    
    const b = Math.round(tokens / 1000000000)
    return `${b}B`
  }
}