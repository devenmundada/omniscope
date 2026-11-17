import type { LucideIcon } from 'lucide-react'
import {
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  ScanSearch,
  Sparkles,
  Target,
  Wallet,
  Dna,
  Route,
  Telescope,
  TrendingUp,
  Radar,
  BookOpenCheck,
  ReceiptIndianRupee,
  FlaskConical,
  Scale,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  question: string
  icon: LucideIcon
}

// Navigation contains only primary experiences. Each answers one question.
export const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', question: 'How is my financial life today?', icon: LayoutDashboard },
  { href: '/portfolio', label: 'Portfolio', question: 'What do I own?', icon: Wallet },
  { href: '/x-ray', label: 'Portfolio X-Ray', question: 'What am I actually exposed to?', icon: ScanSearch },
  { href: '/risk', label: 'Risk Lab', question: 'How much risk am I really taking?', icon: Radar },
  { href: '/rebalance', label: 'Tax-smart Rebalancer', question: 'How do I fix my mix without a tax bill?', icon: Scale },
  { href: '/tax', label: 'Tax Centre', question: 'What would I owe, and how can I owe less?', icon: ReceiptIndianRupee },
  { href: '/health', label: 'Financial Health', question: 'How healthy am I financially?', icon: HeartPulse },
  { href: '/goals', label: 'Goals', question: 'Am I getting closer to my dreams?', icon: Target },
  { href: '/learn', label: 'Learning', question: 'What should I understand next?', icon: GraduationCap },
  { href: '/mentor', label: 'AI Copilot', question: 'What should I do now?', icon: Sparkles },
  { href: '/dna', label: 'Wealth DNA', question: 'Who am I as an investor?', icon: Dna },
  { href: '/market', label: 'Market Intelligence', question: 'Why does this news matter to me?', icon: TrendingUp },
  { href: '/journey', label: 'Wealth Journey', question: 'How have I grown?', icon: Route },
  { href: '/future', label: 'Future Self', question: 'Where am I heading?', icon: Telescope },
  { href: '/evaluation', label: 'Evaluation', question: 'How do we know it works?', icon: FlaskConical },
  { href: '/methodology', label: 'How it works', question: 'Can I trust these numbers?', icon: BookOpenCheck },
]
