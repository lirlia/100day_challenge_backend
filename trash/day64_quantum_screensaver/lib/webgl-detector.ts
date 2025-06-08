export interface WebGLCapabilities {
  hasWebGL: boolean
  hasWebGL2: boolean
  renderer: string
  vendor: string
  version: string
  maxTextureSize: number
  maxVertexUniforms: number
  maxFragmentUniforms: number
  extensions: string[]
  error?: string
}

export function detectWebGL(): WebGLCapabilities {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1

  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  let error: string | undefined

  try {
    // Try WebGL2 first
    gl = canvas.getContext('webgl2') as WebGL2RenderingContext
    if (gl) {
      return {
        hasWebGL: true,
        hasWebGL2: true,
        renderer: gl.getParameter(gl.RENDERER) || 'Unknown',
        vendor: gl.getParameter(gl.VENDOR) || 'Unknown',
        version: gl.getParameter(gl.VERSION) || 'Unknown',
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0,
        maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) || 0,
        maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || 0,
        extensions: gl.getSupportedExtensions() || []
      }
    }

    // Fallback to WebGL1
    gl = canvas.getContext('webgl') as WebGLRenderingContext
    if (gl) {
      return {
        hasWebGL: true,
        hasWebGL2: false,
        renderer: gl.getParameter(gl.RENDERER) || 'Unknown',
        vendor: gl.getParameter(gl.VENDOR) || 'Unknown',
        version: gl.getParameter(gl.VERSION) || 'Unknown',
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0,
        maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) || 0,
        maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || 0,
        extensions: gl.getSupportedExtensions() || []
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown WebGL error'
    console.error('WebGL detection failed:', e)
  }

  return {
    hasWebGL: false,
    hasWebGL2: false,
    renderer: 'None',
    vendor: 'None',
    version: 'None',
    maxTextureSize: 0,
    maxVertexUniforms: 0,
    maxFragmentUniforms: 0,
    extensions: [],
    error
  }
}

export function getWebGLErrorMessage(capabilities: WebGLCapabilities): string {
  if (capabilities.hasWebGL) {
    return ''
  }

  return `
WebGLがサポートされていません。

考えられる原因:
• ブラウザでWebGLが無効になっている
• グラフィックドライバが古い
• ハードウェアアクセラレーションが無効
• リソース不足

解決方法:
• ブラウザでWebGLを有効にする
• グラフィックドライバを更新
• ハードウェアアクセラレーションを有効にする
• ブラウザを再起動

${capabilities.error ? `エラー詳細: ${capabilities.error}` : ''}
  `.trim()
}

export function isWebGLAvailable(): boolean {
  return detectWebGL().hasWebGL
}
