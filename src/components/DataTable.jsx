import { Fragment } from 'react'

export default function DataTable({
  columns,
  rows,
  emptyMessage = 'Nothing to show yet.',
  expandedRowIds = [],
  renderExpandedRow,
}) {
  if (!rows.length) return <div className="table-empty">{emptyMessage}</div>
  return <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <Fragment key={row.id}><tr>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>{renderExpandedRow && expandedRowIds.includes(row.id) && <tr className="data-table-expanded"><td colSpan={columns.length}>{renderExpandedRow(row)}</td></tr>}</Fragment>)}</tbody></table></div>
}
