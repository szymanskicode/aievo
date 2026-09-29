import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { App } from './App.tsx'

describe('App', () => {
  it('counts clicks', async () => {
    const user = userEvent.setup()
    render(<App />)

    const button = screen.getByRole('button', { name: 'Clicked 0 times' })
    await user.click(button)

    expect(button).toHaveTextContent('Clicked 1 time')
  })
})
