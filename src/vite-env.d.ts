interface EthereumRequestArguments {
  method: string
  params?: unknown[]
}

interface EthereumProvider {
  request(args: EthereumRequestArguments): Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export {}
