import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1000px] mx-auto px-4 py-12">
          <h1 className="text-white text-5xl font-bold font-ubuntu mb-8">Terms of Service</h1>

          <div className="bg-[#3a3a3a] rounded-2xl p-8 space-y-6">
            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">1. Acceptance of Terms</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                By accessing and using SaaSRow, you accept and agree to be bound by the terms and provision
                of this agreement.
              </p>
            </section>

            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">2. Use License</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                Permission is granted to temporarily access the materials on SaaSRow for personal,
                non-commercial transitory viewing only.
              </p>
            </section>

            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">3. Disclaimer</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                The materials on SaaSRow are provided on an 'as is' basis. SaaSRow makes no warranties,
                expressed or implied, and hereby disclaims and negates all other warranties including, without
                limitation, implied warranties or conditions of merchantability, fitness for a particular
                purpose, or non-infringement of intellectual property or other violation of rights.
              </p>
            </section>

            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">4. Limitations</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                In no event shall SaaSRow or its suppliers be liable for any damages (including, without
                limitation, damages for loss of data or profit, or due to business interruption) arising out of
                the use or inability to use the materials on SaaSRow.
              </p>
            </section>

            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">5. Modifications</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                SaaSRow may revise these terms of service at any time without notice. By using this website
                you are agreeing to be bound by the then current version of these terms of service.
              </p>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
