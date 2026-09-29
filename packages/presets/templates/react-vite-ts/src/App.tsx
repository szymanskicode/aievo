import { useState } from 'react'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <main>
      <h1>{{projectName}}</h1>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Clicked {count} {count === 1 ? 'time' : 'times'}
      </button>
    </main>
  )
}
