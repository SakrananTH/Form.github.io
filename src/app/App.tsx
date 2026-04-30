import { HashRouter, Routes, Route } from 'react-router-dom';
import { AdminPage } from './components/AdminPage';
import { FormFillPage } from './components/FormFillPage';
import { ResultsPage } from './components/ResultsPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AdminPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/form/:formId" element={<FormFillPage />} />
        <Route path="/results/:formId" element={<ResultsPage />} />
      </Routes>
    </HashRouter>
  );
}