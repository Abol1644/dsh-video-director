// Maps the automatic JSX runtime (used by remotion's dist and our TSX) onto the
// Harness page's single React instance, so no second React is bundled.
import * as React from 'react'

type Props = Record<string, unknown> & { children?: unknown }
function make(type: unknown, props: Props, key?: unknown) {
  const { children, ...rest } = props ?? {}
  const p: Record<string, unknown> = key === undefined ? rest : { ...rest, key }
  return Array.isArray(children)
    ? React.createElement(type as never, p, ...(children as never[]))
    : children === undefined ? React.createElement(type as never, p) : React.createElement(type as never, p, children as never)
}
export const jsx = make
export const jsxs = make
export const jsxDEV = make
export const Fragment = React.Fragment
