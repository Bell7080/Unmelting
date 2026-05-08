/**
 * FontManager - Centralized font control with 12px minimum enforcement
 * All font operations must route through this system to ensure accessibility
 */

export interface FontConfig {
  family: string
  size: number
  weight?: number
  lineHeight?: number
}

export interface CustomFontFace {
  family: string
  url: string
  weight?: number | string
  style?: string
  format?: string
}

export class FontManager {
  private static readonly MIN_FONT_SIZE = 12
  private static readonly STYLE_ELEMENT_ID = 'font-manager-faces'
  private static fonts: Map<string, FontConfig> = new Map()
  private static loadedFaces: Set<string> = new Set()
  private static primaryFamily: string = `'Georgia', 'Times New Roman', serif`

  /**
   * Register a named font configuration
   * Automatically enforces minimum size constraint
   */
  static defineFont(name: string, config: FontConfig): void {
    const safeConfig = {
      ...config,
      size: Math.max(config.size, this.MIN_FONT_SIZE),
    }
    this.fonts.set(name, safeConfig)
  }

  /**
   * Get a registered font configuration
   */
  static getFont(name: string): FontConfig | undefined {
    return this.fonts.get(name)
  }

  /**
   * Validate and enforce minimum font size
   */
  static validateSize(size: number): number {
    return Math.max(size, this.MIN_FONT_SIZE)
  }

  /**
   * Apply font styles to a DOM element
   * Ensures minimum font size is enforced
   */
  static applyToElement(element: HTMLElement, fontName: string): void {
    const config = this.fonts.get(fontName)
    if (!config) {
      console.warn(`Font "${fontName}" not found`)
      return
    }
    this.applyConfig(element, config)
  }

  /**
   * Apply font configuration directly
   */
  static applyConfig(element: HTMLElement, config: FontConfig): void {
    const safeSize = this.validateSize(config.size)
    element.style.fontFamily = config.family
    element.style.fontSize = `${safeSize}px`
    if (config.weight) {
      element.style.fontWeight = config.weight.toString()
    }
    if (config.lineHeight) {
      element.style.lineHeight = config.lineHeight.toString()
    }
  }

  /**
   * Generate CSS custom properties for global font settings
   */
  static getGlobalStyles(): Record<string, string> {
    return {
      '--font-size-base': `${this.validateSize(14)}px`,
      '--font-size-sm': `${this.validateSize(12)}px`,
      '--font-size-lg': `${this.validateSize(18)}px`,
      '--font-size-xl': `${this.validateSize(24)}px`,
    }
  }

  /**
   * Initialize default fonts
   */
  static initializeDefaults(): void {
    this.defineFont('body', {
      family: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Courier New', monospace`,
      size: 14,
      lineHeight: 1.6,
    })

    this.defineFont('ui-small', {
      family: `'Courier New', monospace`,
      size: 12,
      weight: 400,
    })

    this.defineFont('ui-normal', {
      family: `'Courier New', monospace`,
      size: 14,
      weight: 400,
    })

    this.defineFont('ui-large', {
      family: `'Courier New', monospace`,
      size: 18,
      weight: 600,
    })

    this.defineFont('card-title', {
      family: `'Courier New', monospace`,
      size: 16,
      weight: 700,
      lineHeight: 1.4,
    })

    this.defineFont('card-description', {
      family: `'Courier New', monospace`,
      size: 12,
      weight: 400,
      lineHeight: 1.5,
    })
  }

  /**
   * List all registered fonts
   */
  static listFonts(): string[] {
    return Array.from(this.fonts.keys())
  }

  /**
   * Register a custom @font-face by URL (e.g. a Vite-imported asset URL).
   * Idempotent: calling twice with the same family/url is a no-op.
   */
  static loadCustomFont(face: CustomFontFace): void {
    const key = `${face.family}|${face.url}|${face.weight ?? ''}|${face.style ?? ''}`
    if (this.loadedFaces.has(key)) return
    this.loadedFaces.add(key)

    const styleEl = this.ensureStyleElement()
    const format = face.format ?? this.guessFormat(face.url)
    const rule = `
@font-face {
  font-family: '${face.family}';
  src: url('${face.url}') format('${format}');
  font-weight: ${face.weight ?? 'normal'};
  font-style: ${face.style ?? 'normal'};
  font-display: swap;
}`
    styleEl.appendChild(document.createTextNode(rule))
  }

  /**
   * Set the application-wide primary font family.
   * Updates the --font-family-primary CSS variable on :root and
   * applies it to <body> directly so existing styles inherit.
   */
  static setPrimaryFamily(family: string): void {
    this.primaryFamily = family
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--font-family-primary', family)
      if (document.body) document.body.style.fontFamily = family
    }
  }

  static getPrimaryFamily(): string {
    return this.primaryFamily
  }

  private static ensureStyleElement(): HTMLStyleElement {
    let el = document.getElementById(this.STYLE_ELEMENT_ID) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = this.STYLE_ELEMENT_ID
      document.head.appendChild(el)
    }
    return el
  }

  private static guessFormat(url: string): string {
    const lower = url.toLowerCase()
    if (lower.includes('.woff2')) return 'woff2'
    if (lower.includes('.woff')) return 'woff'
    if (lower.includes('.otf')) return 'opentype'
    if (lower.includes('.ttf')) return 'truetype'
    return 'woff2'
  }
}

// Initialize defaults on module load
FontManager.initializeDefaults()
