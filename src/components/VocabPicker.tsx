'use client'

// Toggle-chip picker for a controlled vocabulary.
//
// Deliberately not a free-text input: the whole value of these fields is that
// every product uses the same words, so the UI only offers the words that
// exist. Terms are stored as slugs and displayed with the dashes removed.

interface Props {
  label: string
  hint?: string
  options: readonly string[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Ignore further selections past this many terms. */
  max?: number
}

function humanize(term: string): string {
  return term.replace(/-/g, ' ')
}

export default function VocabPicker({
  label,
  hint,
  options,
  selected,
  onChange,
  max,
}: Props) {
  const atLimit = max !== undefined && selected.length >= max

  function toggle(term: string) {
    if (selected.includes(term)) {
      onChange(selected.filter((t) => t !== term))
    } else if (!atLimit) {
      onChange([...selected, term])
    }
  }

  return (
    <div>
      <label className="block text-white font-ubuntu text-lg mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((term) => {
          const isSelected = selected.includes(term)
          return (
            <button
              key={term}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(term)}
              disabled={!isSelected && atLimit}
              className={`px-3 py-1 rounded-full text-sm font-ubuntu capitalize transition-colors ${
                isSelected
                  ? 'bg-[#4FFFE3] text-neutral-900'
                  : atLimit
                    ? 'bg-[#4a4a4a] text-white/30 cursor-not-allowed'
                    : 'bg-[#4a4a4a] text-white/80 hover:bg-[#5a5a5a]'
              }`}
            >
              {humanize(term)}
            </button>
          )
        })}
      </div>
      {hint && <p className="text-white/50 text-sm font-ubuntu mt-2">{hint}</p>}
    </div>
  )
}
