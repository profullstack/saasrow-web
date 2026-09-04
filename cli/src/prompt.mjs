import { createInterface } from 'node:readline/promises'

/** Ask one question on the terminal. Rejects when stdin closes without an answer. */
export async function ask(question, { input = process.stdin, output = process.stderr } = {}) {
  const rl = createInterface({ input, output })
  try {
    const answer = await rl.question(question)
    return answer.trim()
  } finally {
    rl.close()
  }
}
