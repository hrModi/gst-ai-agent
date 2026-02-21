import DashboardLayout from '../components/layout/DashboardLayout'

interface ComingSoonProps {
  title: string
  description: string
  phase: string
}

export default function ComingSoon({ title, description, phase }: ComingSoonProps) {
  return (
    <DashboardLayout title={title}>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 max-w-sm mb-5">{description}</p>
        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
          Coming in Sub-Phase {phase}
        </span>
      </div>
    </DashboardLayout>
  )
}
