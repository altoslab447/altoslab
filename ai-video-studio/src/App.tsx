import { HashRouter as BrowserRouter, Routes, Route } from 'react-router-dom'
import { VideoStudio } from './pages/VideoStudio'
import { Landing } from './pages/Landing'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/studio" element={<VideoStudio />} />
      </Routes>
    </BrowserRouter>
  )
}
