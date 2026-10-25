/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Globe, Plus, Code2, Play, Sparkles, RefreshCw } from 'lucide-react';
import { InteractiveControl, WebpageSection } from '../types';

interface CustomWebSandboxProps {
  onLoadCustomControls: (sections: WebpageSection[]) => void;
  isAssistiveLayerActive: boolean;
}

const TEMPLATES: Record<string, { name: string; url: string; sections: WebpageSection[] }> = {
  banking: {
    name: 'Secure Online Banking Transfer',
    url: 'https://national-bank.example/transfer',
    sections: [
      {
        id: 'bank_auth',
        title: 'Account Verification',
        iconName: 'Shield',
        description: 'Two-factor account check',
        controls: [
          { id: 'b_acc', sectionId: 'bank_auth', type: 'input', label: 'From Checking Account #', role: 'input', value: '4421-9980-12' },
          { id: 'b_pin', sectionId: 'bank_auth', type: 'input', label: 'Security PIN', role: 'input', value: '****' },
        ],
      },
      {
        id: 'bank_transfer',
        title: 'Recipient & Amount',
        iconName: 'DollarSign',
        description: 'Wire instructions',
        controls: [
          { id: 'b_recip', sectionId: 'bank_transfer', type: 'input', label: 'Recipient Name', role: 'input', value: 'Landlord Rent LLC' },
          { id: 'b_amt', sectionId: 'bank_transfer', type: 'input', label: 'Transfer Amount ($)', role: 'input', value: '$1,250.00' },
          { id: 'b_memo', sectionId: 'bank_transfer', type: 'textarea', label: 'Transfer Memo', role: 'textarea', value: 'November 2026 Housing Rent' },
          { id: 'b_confirm', sectionId: 'bank_transfer', type: 'button', label: 'Authorize Wire Transfer', role: 'button' },
        ],
      },
    ],
  },
  ecommerce: {
    name: 'Express Checkout & Shipping',
    url: 'https://store.example/checkout',
    sections: [
      {
        id: 'shop_shipping',
        title: 'Shipping Destination',
        iconName: 'Truck',
        description: 'Physical address for delivery',
        controls: [
          { id: 's_street', sectionId: 'shop_shipping', type: 'input', label: 'Street Address', role: 'input', value: '742 Evergreen Terrace' },
          { id: 's_zip', sectionId: 'shop_shipping', type: 'input', label: 'Postal Code', role: 'input', value: '97477' },
          { id: 's_gift', sectionId: 'shop_shipping', type: 'checkbox', label: 'This order is a gift (exclude prices from packing slip)', role: 'checkbox', value: 'true' },
        ],
      },
      {
        id: 'shop_payment',
        title: 'Payment Method',
        iconName: 'CreditCard',
        description: 'One-switch secure payment',
        controls: [
          { id: 's_method', sectionId: 'shop_payment', type: 'select', label: 'Payment Type', role: 'select', value: 'Accessible One-Touch Pay', options: ['Accessible One-Touch Pay', 'Assistive Debit', 'Invoice Voucher'] },
          { id: 's_pay_btn', sectionId: 'shop_payment', type: 'button', label: 'Place Order Now ($49.99)', role: 'button' },
        ],
      },
    ],
  },
};

export const CustomWebSandbox: React.FC<CustomWebSandboxProps> = ({ onLoadCustomControls, isAssistiveLayerActive }) => {
  const [targetUrl, setTargetUrl] = useState('https://accessibility-testbed.org/form-demo');
  const [selectedTemplate, setSelectedTemplate] = useState<'banking' | 'ecommerce'>('banking');

  const handleApplyTemplate = (key: 'banking' | 'ecommerce') => {
    setSelectedTemplate(key);
    setTargetUrl(TEMPLATES[key].url);
    onLoadCustomControls(TEMPLATES[key].sections);
  };

  return (
    <div className="bg-[#F4F3EE] p-4 rounded-lg border-2 border-[#D6D1C4] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-[#B45309]" />
          <h3 className="font-bold text-sm text-[#1C1917]">Universal URL & Webpage Simulator</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#57534E]">Load Preset Testbeds:</span>
          <button
            onClick={() => handleApplyTemplate('banking')}
            className={`px-2.5 py-1 text-xs font-bold rounded border ${
              selectedTemplate === 'banking'
                ? 'bg-[#1C1917] text-white border-[#1C1917]'
                : 'bg-white text-[#1C1917] border-[#D6D1C4]'
            }`}
          >
            Bank Wire Form
          </button>
          <button
            onClick={() => handleApplyTemplate('ecommerce')}
            className={`px-2.5 py-1 text-xs font-bold rounded border ${
              selectedTemplate === 'ecommerce'
                ? 'bg-[#1C1917] text-white border-[#1C1917]'
                : 'bg-white text-[#1C1917] border-[#D6D1C4]'
            }`}
          >
            E-Commerce Checkout
          </button>
        </div>
      </div>

      {/* URL Bar simulation */}
      <div className="flex items-center gap-2 bg-white p-2 rounded border border-[#D6D1C4]">
        <span className="text-xs font-mono font-bold text-[#15803D] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
          HTTPS
        </span>
        <input
          type="text"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="Enter any website URL to scan (e.g. https://my-college.edu/login)"
          className="flex-1 text-xs font-mono text-[#1C1917] outline-none"
        />
        <button
          onClick={() => handleApplyTemplate(selectedTemplate)}
          className="px-3 py-1 bg-[#B45309] hover:bg-[#92400E] text-white text-xs font-bold rounded flex items-center gap-1"
        >
          <RefreshCw size={12} />
          <span>Scan Page</span>
        </button>
      </div>
      <p className="text-[11px] text-[#57534E]">
        💡 AccessScan runs on-the-fly in browser memory. In production, the installed Chrome extension dynamically scans any loaded tab with zero configuration.
      </p>
    </div>
  );
};
