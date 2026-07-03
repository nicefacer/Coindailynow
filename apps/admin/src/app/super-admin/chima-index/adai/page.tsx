'use client';

import ChimaIndexDetail from '@/components/super-admin/ChimaIndexDetail';

export default function ADAIPage() {
  return (
    <ChimaIndexDetail
      symbol="ADAI"
      name="African DeFi Activity Index"
      blurb="Composite of on-chain DeFi activity across African markets — TVL, daily active wallets, transaction volume."
    />
  );
}
