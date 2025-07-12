export type CostFormat = 'currency' | 'number' | 'compact'
export type CostLevel = 'free' | 'low' | 'medium' | 'high' | 'very-high'

export class CostFormatter {
  static format(cost: number, format: CostFormat = 'currency'): string {
    const normalizedCost = Math.max(0, cost)
    
    switch (format) {
      case 'currency':
        return this.formatCurrency(normalizedCost)
      case 'number':
        return this.formatNumber(normalizedCost)
      case 'compact':
        return this.formatCompact(normalizedCost)
      default:
        return this.formatCurrency(normalizedCost)
    }
  }

  static formatWithPrecision(cost: number, precision: number): string {
    const normalizedCost = Math.max(0, cost)
    const validPrecision = Math.max(0, Math.min(4, Math.floor(precision)))
    return `$${normalizedCost.toFixed(validPrecision)}`
  }

  static parseCostString(costString: string): number {
    try {
      if (!costString || costString.trim() === '') return 0
      
      // $記号と末尾の$を除去
      const cleanString = costString.replace(/[$]/g, '').trim()
      const num = parseFloat(cleanString)
      
      return isNaN(num) ? 0 : Math.max(0, num)
    } catch (error) {
      return 0
    }
  }

  static formatPerHour(costPerHour: number, format: CostFormat = 'currency'): string {
    const formattedCost = this.format(costPerHour, format)
    return `${formattedCost}/h`
  }

  static formatRange(minCost: number, maxCost: number, format: CostFormat = 'currency'): string {
    const min = this.format(minCost, format)
    const max = this.format(maxCost, format)
    
    return minCost === maxCost ? min : `${min}-${max}`
  }

  static getCostLevel(cost: number): CostLevel {
    if (cost <= 0) return 'free'
    if (cost <= 2) return 'low'
    if (cost <= 10) return 'medium'
    if (cost <= 30) return 'high'
    return 'very-high'
  }

  static formatSavings(savings: number): string {
    if (savings === 0) return 'No savings'
    if (savings > 0) return `Save ${this.format(savings, 'currency')}`
    return `Additional ${this.format(Math.abs(savings), 'currency')}`
  }

  private static formatCurrency(cost: number): string {
    return `$${cost.toFixed(2)}`
  }

  private static formatNumber(cost: number): string {
    return cost.toFixed(2)
  }

  private static formatCompact(cost: number): string {
    if (cost === 0) return '0$'
    
    // 整数の場合は小数点なし
    if (cost % 1 === 0) {
      return `${Math.floor(cost)}$`
    }
    
    // 小数の場合は有効桁数のみ
    const formatted = cost.toFixed(2).replace(/\.?0+$/, '')
    return `${formatted}$`
  }
}