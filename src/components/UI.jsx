import { useEffect } from 'react'
import { X, Search, ChevronDown, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react'

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Button({ children, variant = 'primary', icon: Icon, className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{Icon && <Icon size={16} strokeWidth={2} />}{children}</button>
}

export function IconButton({ label, children, ...props }) {
  return <button className="icon-button" aria-label={label} title={label} {...props}>{children}</button>
}

export function SearchBox({ value, onChange, placeholder = 'Search...' }) {
  return <label className="search-box"><Search size={16} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>
}

export function Select({ value, onChange, children, ...props }) {
  const { className = '', ...selectProps } = props
  return <div className={`select-wrap ${className}`}><select value={value} onChange={onChange} {...selectProps}>{children}</select><ChevronDown size={15} /></div>
}

export function Badge({ children, tone }) {
  const key = (tone || children || '').toLowerCase().replaceAll(' ', '-')
  return <span className={`badge badge-${key}`}>{children}</span>
}

export function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function Modal({ title, description, onClose, children, wide = false, className = '' }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></div>
        {children}
      </section>
    </div>
  )
}

export function FormField({ label, children, className = '' }) {
  return <label className={`form-field ${className}`}><span>{label}</span>{children}</label>
}

export function EmptyState({ title, message }) {
  return <div className="empty-state"><span className="empty-mark">✳</span><strong>{title}</strong><p>{message}</p></div>
}

export function TableToolbar({ search, setSearch, children, placeholder }) {
  return <div className="table-toolbar"><SearchBox value={search} onChange={setSearch} placeholder={placeholder} /><div className="toolbar-actions">{children}</div></div>
}

export function TableFrame({ title, note, children, action, className = '' }) {
  return <Card className={`table-card ${className}`}><div className="card-heading"><div><h2>{title}</h2>{note && <p>{note}</p>}</div>{action}</div>{children}</Card>
}

export function AddButton({ children = 'Add new', ...props }) {
  return <Button icon={Plus} {...props}>{children}</Button>
}

export function Trend({ children, direction = 'up' }) {
  const Icon = direction === 'up' ? ArrowUpRight : ArrowDownRight
  return <span className={`trend trend-${direction}`}><Icon size={14} />{children}</span>
}
