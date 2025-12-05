declare module '@rsksmart/rns-resolver.js' {
  export interface RNSResolver {
    addr(name: string): Promise<string>;
    reverse(address: string): Promise<string>;
  }

  export interface RNSResolverStatic {
    forRskMainnet(config: any): RNSResolver;
    forRskTestnet(config: any): RNSResolver;
  }

  const RNSResolverModule: {
    default: RNSResolverStatic;
  };

  export default RNSResolverModule;
}

