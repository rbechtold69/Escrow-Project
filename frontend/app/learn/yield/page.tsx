'use client';

import { ArrowLeft, Shield, TrendingUp, CheckCircle2, Building2, Scale, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function LearnYieldPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          How Interest Earning Works
        </h1>
        <p className="text-lg text-gray-600">
          Learn how your escrowed funds can earn interest while remaining fully secure.
        </p>
      </div>

      {/* Hero Card */}
      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 mb-8">
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Earn ~4-5% APY While Your Funds Are in Escrow
              </h2>
              <p className="text-gray-700">
                When you enable interest earning, your deposited funds work for you instead of 
                sitting idle. All interest earned belongs to you, the buyer, and is automatically 
                added to your funds at escrow close.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">How It Works</h2>
        <div className="space-y-4">
          {[
            {
              step: 1,
              title: 'You Wire Funds to Escrow',
              description: 'Your funds are wired to a dedicated escrow account in your name using standard banking rails (ACH or wire transfer).',
            },
            {
              step: 2,
              title: 'Funds Are Held Securely',
              description: 'Your funds are held with FDIC-eligible banking partners and tier-1 custodians like BlackRock and Fidelity.',
            },
            {
              step: 3,
              title: 'Interest Accrues Daily',
              description: 'While in escrow, your funds earn interest at competitive rates (currently ~4-5% APY). Interest accrues daily.',
            },
            {
              step: 4,
              title: 'All Interest Returned to You',
              description: 'When the escrow closes, 100% of the interest earned is added to your funds. Neither the escrow agent nor the platform keeps any of it.',
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">
                {item.step}
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{item.title}</h3>
                <p className="text-gray-600 text-sm mt-1">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Safety & Security */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Safety & Security</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              icon: Shield,
              title: 'Funds Backed 1:1',
              description: 'Your funds are always backed 1:1 by equivalent US dollars. There is no leverage or risk to your principal.',
            },
            {
              icon: Building2,
              title: 'Tier-1 Custodians',
              description: 'Funds are held with institutions like BlackRock and Fidelity, the same firms that manage trillions in assets.',
            },
            {
              icon: Lock,
              title: 'Segregated Accounts',
              description: 'Each escrow has its own segregated account. Your funds are never commingled with others.',
            },
            {
              icon: Scale,
              title: 'Legally Protected',
              description: 'All interest legally belongs to you as the depositor. This is documented and enforced in the escrow agreement.',
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <item.icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{item.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Legal Compliance */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Legal Compliance</h2>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-100 rounded-full">
                <Scale className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">100% of Interest Goes to the Buyer</h3>
                <p className="text-gray-700 mb-4">
                  By law, any interest or earnings on escrowed funds belongs to the party who 
                  deposited those funds—the buyer. EscrowPayi and the escrow agent do not retain 
                  any portion of the interest earned.
                </p>
                <ul className="space-y-2">
                  {[
                    'Interest is calculated and tracked transparently',
                    'Automatically added to your funds at close',
                    'Full audit trail maintained for compliance',
                    'Documented in escrow agreement',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* FAQ */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {[
            {
              q: 'Is there any risk to my principal?',
              a: 'No. Your funds are always backed 1:1 by US dollars held with FDIC-eligible banking partners. The interest-earning option does not put your principal at risk.',
            },
            {
              q: 'Can I opt out of interest earning?',
              a: 'Yes. When the escrow is created, you can choose "Standard Hold" which keeps your funds secure without earning interest. Some buyers prefer this simpler option.',
            },
            {
              q: 'How is the interest calculated?',
              a: 'Interest accrues daily based on the current APY rate (approximately 4-5%). The exact amount depends on how long your funds remain in escrow.',
            },
            {
              q: 'When do I receive the interest?',
              a: 'All interest earned is automatically added to your disbursement when the escrow closes. It appears as a separate line item in your closing statement.',
            },
            {
              q: 'Who else has access to my funds?',
              a: 'Only the designated escrow agent can authorize fund releases, and only according to the escrow agreement terms. Your funds remain in a segregated, individual account.',
            },
          ].map((faq) => (
            <Card key={faq.q}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">{faq.q}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-gray-600 text-sm">{faq.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="text-center py-8 border-t">
        <p className="text-gray-600 mb-4">
          Have more questions about how interest earning works?
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/">
            <Button variant="outline">
              Back to Dashboard
            </Button>
          </Link>
          <a href="mailto:support@escrowpayi.com">
            <Button className="bg-blue-600 hover:bg-blue-700">
              Contact Support
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
