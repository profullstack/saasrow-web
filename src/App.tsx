import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Community from './pages/Community'
import Submit from './pages/Submit'
import Featured from './pages/Featured'
import Detailed from './pages/Detailed'
import Tags from './pages/Tags'
import Categories from './pages/Categories'
import About from './pages/About'
import Discover from './pages/Discover'
import Explore from './pages/Explore'
import News from './pages/News'
import NewsPost from './pages/NewsPost'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Admin from './pages/Admin'
import Category from './pages/Category'
import SoftwareDetail from './pages/SoftwareDetail'
import ManageListings from './pages/ManageListings'
import Unsubscribe from './pages/Unsubscribe'
import { Favorites } from './pages/Favorites'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/tags" element={<Tags />} />
        <Route path="/tags/:tag" element={<Tags />} />
        <Route path="/community" element={<Community />} />
        <Route path="/submit" element={<Submit />} />
        <Route path="/featured" element={<Featured />} />
        <Route path="/detailed" element={<Detailed />} />
        <Route path="/about" element={<About />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/news" element={<News />} />
        <Route path="/news/:id" element={<NewsPost />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/category/:category" element={<Category />} />
        <Route path="/software/:id" element={<SoftwareDetail />} />
        <Route path="/manage/:token" element={<ManageListings />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/favorites" element={<Favorites />} />
      </Routes>
    </BrowserRouter>
  )
}
