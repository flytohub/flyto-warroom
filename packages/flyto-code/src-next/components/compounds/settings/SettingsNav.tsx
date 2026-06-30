import { SETTINGS_GROUPS, type SettingsCategory } from './categories'

interface SettingsNavProps {
  active: SettingsCategory
  onSelect: (cat: SettingsCategory) => void
  hiddenCategories?: ReadonlySet<SettingsCategory>
}

export function SettingsNav({ active, onSelect, hiddenCategories }: SettingsNavProps) {
  const groups = SETTINGS_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !hiddenCategories?.has(item.id)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="nav-links">
      {groups.map((group, gi) => (
        <div key={group.key}>
          {gi > 0 && <div className="nav-divider" />}
          <div className="nav-section-label">{group.label()}</div>
          {group.items.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={`nav-link${active === item.id ? ' active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <Icon size={18} className="nav-link-icon" />
                {item.label()}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
