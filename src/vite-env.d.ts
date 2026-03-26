interface EthereumRequestArguments {
  method: string
  params?: unknown[]
}

interface EthereumProvider {
  request(args: EthereumRequestArguments): Promise<unknown>
}

interface ImportMetaEnv {
  readonly VITE_TRYSTERO_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export {}
