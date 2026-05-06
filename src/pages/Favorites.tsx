import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { supabase } from '../lib/supabase';
import { Heart, ExternalLink } from 'lucide-react';
import { BookmarkButton } from '../components/BookmarkButton';

interface Software {
  id: string;
  title: string;
  description: string;
  url: string;
  logo?: string;
  category: string;
  tier?: string;
  upvotes?: number;
  downvotes?: number;
}

export function Favorites() {
  const [favoriteSoftware, setFavoriteSoftware] = useState<Software[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (userId) {
      loadFavorites();
    } else {
      setIsLoading(false);
    }
  }, [userId]);

  const checkAuth = () => {
    const email = sessionStorage.getItem('userEmail');
    const uid = sessionStorage.getItem('userId');
    setUserEmail(email);
    setUserId(uid);
  };

  const loadFavorites = async () => {
    if (!userId) return;

    try {
      const { data: favorites, error: favoritesError } = await supabase
        .from('favorites')
        .select('submission_id')
        .eq('user_id', userId);

      if (favoritesError) throw favoritesError;

      if (!favorites || favorites.length === 0) {
        setIsLoading(false);
        return;
      }

      const submissionIds = favorites.map(f => f.submission_id);

      const { data: submissions, error: subError } = await supabase
        .from('software_submissions')
        .select('*')
        .in('id', submissionIds)
        .eq('status', 'approved');

      if (subError) throw subError;

      setFavoriteSoftware(submissions || []);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFavoriteToggled = () => {
    loadFavorites();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#222222] flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-white text-xl">Loading...</div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="min-h-screen bg-[#222222] flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
              <Heart className="w-8 h-8 text-red-500 fill-red-500" />
              <h1 className="text-4xl font-bold text-white">My Favorites</h1>
            </div>
            <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
              <Heart className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <p className="text-white/70 text-lg mb-6">
                Please log in to view your favorites
              </p>
              <Link
                to="/discover"
                className="inline-block bg-white text-[#222222] px-8 py-3 rounded-lg hover:bg-white/90 transition-colors font-semibold"
              >
                Discover Software
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#222222] flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <Heart className="w-8 h-8 text-red-500 fill-red-500" />
            <h1 className="text-4xl font-bold text-white">My Favorites</h1>
          </div>

          {favoriteSoftware.length === 0 ? (
            <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
              <Heart className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <p className="text-white/70 text-lg mb-6">
                You haven't saved any software yet
              </p>
              <Link
                to="/discover"
                className="inline-block bg-white text-[#222222] px-8 py-3 rounded-lg hover:bg-white/90 transition-colors font-semibold"
              >
                Discover Software
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favoriteSoftware.map((software) => {
                const netVotes = (software.upvotes || 0) - (software.downvotes || 0);

                return (
                  <div
                    key={software.id}
                    className="bg-[#3a3a3a] rounded-xl p-6 hover:bg-[#4a4a4a] transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <Link to={`/software/${software.id}`} className="flex items-start gap-3 flex-1">
                        {software.logo && (
                          <img
                            src={supabase.storage.from('software-logos').getPublicUrl(software.logo).data.publicUrl}
                            alt={software.title}
                            className="w-12 h-12 rounded-lg object-cover bg-white p-2 flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-bold text-lg break-words">
                            {software.title}
                          </h3>
                          <span className="text-white/50 text-sm capitalize">
                            {software.category}
                          </span>
                        </div>
                      </Link>
                      <div onClick={handleFavoriteToggled}>
                        <BookmarkButton submissionId={software.id} size="md" />
                      </div>
                    </div>

                    <p className="text-white/70 text-sm mb-4 line-clamp-2">
                      {software.description}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-white/70 text-sm">
                          {netVotes} {netVotes === 1 ? 'vote' : 'votes'}
                        </div>
                        {software.tier && (
                          <span className="text-xs px-2 py-1 rounded bg-[#222222] text-white/70 capitalize">
                            {software.tier}
                          </span>
                        )}
                      </div>
                      <a
                        href={software.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/70 hover:text-white transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
