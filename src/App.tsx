import { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import EntriesManager from './components/EntriesManager';
import HistoryView from './components/HistoryView';
import { useDatabase } from './hooks/useDatabase';

function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'entries' | 'history'>('dashboard');
  const {
    balance,
    templates,
    monthlyAmountsMap,
    snapshots,
    loading,
    setBalance,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    toggleTemplate,
    setMonthlyAmount,
    copyMonthlyAmounts,
    getMonthlyAmountsForMonth,
    addSnapshot,
    deleteSnapshot
  } = useDatabase();

  if (loading) {
    return (
      <Layout currentView={currentView} onNavigate={setCurrentView}>
        <div className="flex items-center justify-center h-full">
          <p className="text-slate-400 text-lg">Loading...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentView={currentView} onNavigate={setCurrentView}>
      {currentView === 'dashboard' && (
        <Dashboard
          balance={balance}
          templates={templates}
          monthlyAmountsMap={monthlyAmountsMap}
          onUpdateBalance={setBalance}
        />
      )}
      {currentView === 'entries' && (
        <EntriesManager
          templates={templates}
          monthlyAmountsMap={monthlyAmountsMap}
          onAddTemplate={addTemplate}
          onUpdateTemplate={updateTemplate}
          onDeleteTemplate={deleteTemplate}
          onToggleTemplate={toggleTemplate}
          onSetMonthlyAmount={setMonthlyAmount}
          onCopyMonthlyAmounts={copyMonthlyAmounts}
          onLoadMonth={getMonthlyAmountsForMonth}
        />
      )}
      {currentView === 'history' && (
        <HistoryView
          snapshots={snapshots}
          currentBalance={balance}
          onAdd={addSnapshot}
          onDelete={deleteSnapshot}
        />
      )}
    </Layout>
  );
}

export default App;
