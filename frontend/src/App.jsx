import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Archive from './pages/Archive';
import HowItWorks from './pages/HowItWorks';
import About from './pages/About';
import Login from './pages/Login';
import Register from './pages/Register';
import Account from './pages/Account';
import Pricing from './pages/Pricing';
import Privacy from './pages/Privacy';
import Extension from './pages/Extension';
import Admin from './pages/Admin';

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/archive/:id" element={<Archive />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/account" element={<Account />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/extension" element={<Extension />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}
