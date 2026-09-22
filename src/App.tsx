import { Navigate, Route, Routes } from "react-router-dom"
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
    </TooltipProvider>
  )
}

export default App
