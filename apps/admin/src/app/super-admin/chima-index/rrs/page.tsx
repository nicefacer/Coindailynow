'use client';

import ChimaIndexDetail from '@/components/super-admin/ChimaIndexDetail';

export default function RRSPage() {
  return (
    <ChimaIndexDetail
      symbol="RRS"
      name="Regulatory Risk Score"
      blurb="Forward-looking regulatory risk gauge — combines change-detection velocity, enforcement severity, and policy uncertainty across the 40-country database."
    />
  );
}
