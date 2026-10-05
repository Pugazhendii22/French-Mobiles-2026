/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

const Hello = ({ name }) => <p>Hello {name}</p>

describe('component test harness', () => {
  it('renders a component into a DOM', () => {
    render(<Hello name="counter" />)
    expect(screen.getByText('Hello counter')).toBeTruthy()
  })
})
