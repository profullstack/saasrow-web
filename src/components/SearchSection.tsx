import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { trackEvent, analyticsEvents } from '../lib/analytics'

interface SearchSectionProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedFilter: 'all' | 'featured' | 'premium'
  onFilterChange: (filter: 'all' | 'featured' | 'premium') => void
  activeCategories: string[]
  onCategoriesChange: (categories: string[]) => void
  activeTags: string[]
  onTagsChange: (tags: string[]) => void
  selectedSort: string
  onSortChange: (sort: string) => void
  onClearAll?: () => void
}

export function SearchSection({
  searchQuery,
  onSearchChange,
  selectedFilter,
  onFilterChange,
  activeCategories,
  onCategoriesChange,
  activeTags,
  onTagsChange,
  selectedSort,
  onSortChange,
  onClearAll,
}: SearchSectionProps) {

  const filterButtons = [
    { id: 'all' as const, label: 'All' },
    { id: 'featured' as const, label: 'Featured' },
    { id: 'premium' as const, label: 'Premium' },
  ]

  const categoryOptions = [
    'Software',
    'Security',
    'Productivity',
    'Development',
    'Design',
    'Marketing',
    'Analytics',
    'Communication',
  ]

  const sortOptions = ['Most Popular', 'Newest', 'Top Rated', 'A-Z', 'Z-A']

  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [tagSearchQuery, setTagSearchQuery] = useState('')
  const categoryDropdownRef = useRef<HTMLDivElement>(null)
  const tagDropdownRef = useRef<HTMLDivElement>(null)
  const sortDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchTags()
  }, [])

  useEffect(() => {
    if (searchQuery.length >= 3) {
      const timeoutId = setTimeout(() => {
        trackEvent(analyticsEvents.SEARCH_PERFORMED, {
          query: searchQuery,
        });
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false)
      }
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false)
        setTagSearchQuery('')
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('software_submissions')
        .select('tags')
        .eq('status', 'approved')
        .not('tags', 'is', null)

      if (error) throw error

      const allTags = new Set<string>()
      data?.forEach(submission => {
        if (submission.tags && Array.isArray(submission.tags)) {
          submission.tags.forEach(tag => {
            if (tag && tag.trim()) {
              allTags.add(tag.trim())
            }
          })
        }
      })

      setTagOptions(Array.from(allTags).sort())
    } catch (error) {
      console.error('Error fetching tags:', error)
    }
  }

  const handleCategoryToggle = (category: string) => {
    const newCategories = activeCategories.includes(category)
      ? activeCategories.filter((c) => c !== category)
      : [...activeCategories, category]

    if (!activeCategories.includes(category)) {
      trackEvent(analyticsEvents.CATEGORY_VIEWED, {
        category,
      });
    }

    onCategoriesChange(newCategories)
  }

  const handleTagToggle = (tag: string) => {
    const newTags = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag]

    if (!activeTags.includes(tag)) {
      trackEvent(analyticsEvents.TAG_CLICKED, {
        tag,
      });
    }

    onTagsChange(newTags)
  }

  const hasActiveFilters = searchQuery.length > 0 || selectedFilter !== 'all' || activeCategories.length > 0 || activeTags.length > 0

  console.log('SearchSection render:', { hasActiveFilters, searchQuery, selectedFilter, activeCategories, activeTags })

  return (
    <section className="w-full max-w-[1318px] mx-auto px-4 py-8">
      <div className="relative">
        <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center bg-[#4a4a4a] rounded-2xl sm:rounded-full px-4 sm:px-8 py-4 gap-4 z-10">
          <div className="flex items-center flex-1 gap-3">
            {hasActiveFilters ? (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log('Clear button clicked', { searchQuery, selectedFilter, activeCategories, activeTags })
                  if (onClearAll) {
                    onClearAll()
                  } else {
                    onSearchChange('')
                    onFilterChange('all')
                    onCategoriesChange([])
                    onTagsChange([])
                  }
                }}
                className="p-2 hover:bg-red-500/20 rounded-full transition-all flex-shrink-0 cursor-pointer"
                title="Clear all filters"
                type="button"
                id="clear-search-button"
              >
                <svg id="clear-x-icon" className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
                  <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                </svg>
              </button>
            ) : (
              <div className="p-2 flex-shrink-0" id="search-icon-container">
                <svg id="search-magnify-icon" className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" strokeLinecap="round" />
                </svg>
              </div>
            )}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent border-none outline-none text-white text-lg sm:text-2xl placeholder:text-white/70 font-inter"
            />
          </div>

          <div className="flex gap-2 sm:gap-3 sm:ml-4 justify-between sm:justify-start">
            {filterButtons.map((filter) => {
              const isActive = selectedFilter === filter.id
              return (
                <button
                  key={filter.id}
                  onClick={() => onFilterChange(filter.id)}
                  className={`px-4 sm:px-6 py-2 rounded-full font-roboto text-sm sm:text-xl transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800'
                      : 'bg-transparent text-transparent bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] bg-clip-text border border-[#4FFFE3]'
                  }`}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-4 sm:mt-6">
          <div ref={categoryDropdownRef} className="relative">
            <button
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-[#4a4a4a] rounded-full text-white font-roboto text-base sm:text-xl hover:bg-[#555555] transition-colors"
            >
              Category
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {showCategoryDropdown && (
              <div className="absolute top-full mt-2 bg-[#3a3a3a] rounded-xl shadow-xl overflow-hidden z-50 min-w-[200px]">
                {categoryOptions.map((category) => {
                  const isActive = activeCategories.includes(category)
                  return (
                    <button
                      key={category}
                      onClick={() => {
                        handleCategoryToggle(category)
                        setShowCategoryDropdown(false)
                      }}
                      className={`w-full text-left px-6 py-3 text-white font-roboto hover:bg-[#4a4a4a] transition-colors flex items-center gap-2 ${
                        isActive ? 'bg-[#4a4a4a]' : ''
                      }`}
                    >
                      {isActive && (
                        <svg className="w-4 h-4 text-[#4FFFE3]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {category}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div ref={tagDropdownRef} className="relative">
            <button
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-[#4a4a4a] rounded-full text-white font-roboto text-base sm:text-xl hover:bg-[#555555] transition-colors"
            >
              Tags
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {showTagDropdown && (
              <div className="absolute top-full mt-2 bg-[#3a3a3a] rounded-xl shadow-xl overflow-hidden z-50 min-w-[200px] max-w-[300px]">
                <div className="sticky top-0 bg-[#3a3a3a] p-3 border-b border-white/10">
                  <input
                    type="text"
                    value={tagSearchQuery}
                    onChange={(e) => setTagSearchQuery(e.target.value)}
                    placeholder="Search tags..."
                    className="w-full px-3 py-2 bg-[#2a2a2a] text-white font-roboto text-sm rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] placeholder:text-white/50"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {tagOptions
                    .filter(tag =>
                      tag.toLowerCase().includes(tagSearchQuery.toLowerCase())
                    )
                    .map((tag) => {
                      const isActive = activeTags.includes(tag)
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            handleTagToggle(tag)
                          }}
                          className={`w-full text-left px-6 py-3 text-white font-roboto hover:bg-[#4a4a4a] transition-colors flex items-center gap-2 ${
                            isActive ? 'bg-[#4a4a4a]' : ''
                          }`}
                        >
                          {isActive && (
                            <svg className="w-4 h-4 text-[#4FFFE3]" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {tag}
                        </button>
                      )
                    })}
                  {tagOptions.filter(tag =>
                    tag.toLowerCase().includes(tagSearchQuery.toLowerCase())
                  ).length === 0 && (
                    <div className="px-6 py-4 text-white/50 font-roboto text-sm text-center">
                      No tags found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div ref={sortDropdownRef} className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-[#4a4a4a] rounded-full text-white font-roboto text-base sm:text-xl hover:bg-[#555555] transition-colors"
            >
              <span className="hidden sm:inline">{selectedSort}</span>
              <span className="sm:hidden">Sort</span>
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {showSortDropdown && (
              <div className="absolute top-full mt-2 bg-[#3a3a3a] rounded-xl shadow-xl overflow-hidden z-50 min-w-[200px]">
                {sortOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      onSortChange(option)
                      setShowSortDropdown(false)
                    }}
                    className={`w-full text-left px-6 py-3 text-white font-roboto hover:bg-[#4a4a4a] transition-colors ${
                      selectedSort === option ? 'bg-[#4a4a4a]' : ''
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          {(activeCategories.length > 0 || activeTags.length > 0) && (
            <>
              <div className="flex flex-wrap gap-2">
                {activeCategories.map((category) => (
                  <span
                    key={`cat-${category}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#E0FF04]/20 to-[#4FFFE3]/20 rounded-full text-white font-roboto border border-[#4FFFE3]/30"
                  >
                    {category}
                    <button
                      onClick={() => handleCategoryToggle(category)}
                      className="hover:text-[#E0FF04] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </span>
                ))}
                {activeTags.map((tag) => (
                  <span
                    key={`tag-${tag}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#4FFFE3]/20 to-[#E0FF04]/20 rounded-full text-white font-roboto border border-[#E0FF04]/30"
                  >
                    #{tag}
                    <button
                      onClick={() => handleTagToggle(tag)}
                      className="hover:text-[#4FFFE3] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
              <button
                onClick={() => {
                  onCategoriesChange([])
                  onTagsChange([])
                }}
                className="px-4 sm:px-6 py-2 sm:py-3 text-transparent bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] bg-clip-text font-roboto text-base sm:text-xl hover:opacity-80 transition-opacity"
              >
                Clear All
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
