import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

export default function DetailedPage() {
  return (
    <div className="min-h-screen bg-neutral-800">
      <div className="absolute w-full h-1/2 top-0 left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1200px] mx-auto px-4 py-12">
          <div className="space-y-12">
            <section>
              <h2 className="text-white text-3xl font-bold font-ubuntu mb-6">
                Screenshots and images
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-[#3a3a3a] rounded-2xl p-4 aspect-video flex items-center justify-center">
                  <span className="text-white/50">Screenshot 1</span>
                </div>
                <div className="bg-[#3a3a3a] rounded-2xl p-4 aspect-video flex items-center justify-center">
                  <span className="text-white/50">Screenshot 2</span>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-white text-3xl font-bold font-ubuntu mb-6">Videos</h2>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-[#3a3a3a] rounded-2xl p-4 aspect-video flex items-center justify-center">
                  <span className="text-white/50">Video 1</span>
                </div>
                <div className="bg-[#3a3a3a] rounded-2xl p-4 aspect-video flex items-center justify-center">
                  <span className="text-white/50">Video 2</span>
                </div>
                <div className="bg-[#3a3a3a] rounded-2xl p-4 aspect-video flex items-center justify-center">
                  <span className="text-white/50">Video 3</span>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-white text-3xl font-bold font-ubuntu mb-6">Reviews</h2>
              <div className="space-y-4">
                <div className="bg-[#3a3a3a] rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#E0FF04] to-[#4FFFE3]" />
                    <div>
                      <h3 className="text-white font-bold font-ubuntu">User Name</h3>
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                          <svg
                            key={i}
                            className="w-4 h-4 text-[#E0FF04]"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-white/70 font-ubuntu">
                    Great product! Really helped improve our workflow.
                  </p>
                </div>

                <div className="bg-[#3a3a3a] rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4FFFE3] to-[#E0FF04]" />
                    <div>
                      <h3 className="text-white font-bold font-ubuntu">Another User</h3>
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                          <svg
                            key={i}
                            className="w-4 h-4 text-[#E0FF04]"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-white/70 font-ubuntu">
                    Excellent support team and easy to use interface.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
