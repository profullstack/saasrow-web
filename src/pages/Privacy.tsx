import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1000px] mx-auto px-4 py-12">
          <h1 className="text-white text-5xl font-bold font-ubuntu mb-8">Privacy Policy</h1>

          <div className="bg-[#3a3a3a] rounded-2xl p-8 space-y-6">
            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">Information We Collect</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                We collect information that you provide directly to us, including when you create an account,
                subscribe to our newsletter, submit software, or participate in community discussions.
              </p>
            </section>

            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">How We Use Your Information</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                We use the information we collect to provide, maintain, and improve our services, to develop
                new features, to protect SaaSRow and our users, and to communicate with you about our
                services.
              </p>
            </section>

            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">Information Sharing</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                We do not share your personal information with third parties except as described in this
                policy. We may share information with service providers who perform services on our behalf.
              </p>
            </section>

            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">Data Security</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                We use appropriate technical and organizational measures to protect the personal information
                we collect and process. However, no security system is impenetrable and we cannot guarantee
                the security of our systems 100%.
              </p>
            </section>

            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">Your Rights</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                You have the right to access, update, or delete your personal information. You may also have
                the right to restrict or object to certain processing of your information. To exercise these
                rights, please contact us.
              </p>
            </section>

            <section>
              <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">Changes to This Policy</h2>
              <p className="text-white/90 font-ubuntu leading-relaxed">
                We may update this privacy policy from time to time. We will notify you of any changes by
                posting the new privacy policy on this page and updating the "Last Updated" date.
              </p>
            </section>

            <p className="text-white/50 font-ubuntu text-sm mt-8">Last Updated: October 24, 2025</p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
