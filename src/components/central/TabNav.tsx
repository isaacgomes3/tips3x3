import { BarChart3, ListOrdered, Sliders, Send, Image } from 'lucide-react';
import type { TabKey } from '@/lib/central/types';

interface TabNavProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

const tabs: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
  { key: 'statistics', label: 'Estatisticas', icon: BarChart3 },
  { key: 'entries', label: 'Entradas', icon: ListOrdered },
  { key: 'stake', label: 'Gestao de Stake', icon: Sliders },
  { key: 'criativos', label: 'Criativos', icon: Image },
  { key: 'telegram', label: 'Telegram', icon: Send },
];

export default function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="flex gap-1 bg-dark-800 p-1 rounded-xl border border-dark-600">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex-1 justify-center ${
              isActive
                ? 'bg-dark-600 text-gold-400 shadow-sm shadow-black/20'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
