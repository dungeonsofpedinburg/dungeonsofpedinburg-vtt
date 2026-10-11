import { Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MasterPanel } from "@/pages/MasterPanel"
import { ObsScreen } from "@/pages/ObsScreen"

function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/" element={<MasterPanel />} />
        <Route path="/master" element={<MasterPanel />} />
        <Route path="/screen" element={<ObsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Служебные уведомления — тостами сверху по центру: они исчезают сами
          (2–3 с) и не сдвигают панели, как это делали строки-статусы. */}
      <Toaster position="top-center" richColors />
    </TooltipProvider>
  )
}

export default App
