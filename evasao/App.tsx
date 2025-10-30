import React, { useState, useEffect } from 'react';
import CounterCard from './components/CounterCard';
import EvasionTable from './components/EvasionTable';
import { LAST_EVASION_DATE, COST_PER_AUDITOR, EVASION_DATA, AUDITORS_WHO_LEFT_AFTER_POSSE } from './constants';

const App: React.FC = () => {
  const [daysSinceLastEvasion, setDaysSinceLastEvasion] = useState(0);

  useEffect(() => {
    const today = new Date();
    const differenceInTime = today.getTime() - LAST_EVASION_DATE.getTime();
    const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
    setDaysSinceLastEvasion(differenceInDays);
  }, []);

  const totalCost = COST_PER_AUDITOR * AUDITORS_WHO_LEFT_AFTER_POSSE;

  const totalEvasions = EVASION_DATA.reduce((sum, item) => sum + item.count, 0);

  const CalendarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 md:h-12 md:w-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
  
  const MoneyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 md:h-12 md:w-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01M12 6v-1h4a2 2 0 012 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2h4z" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2">Observatório da Evasão</h1>
          <p className="text-lg text-cyan-400 font-medium">Auditores Fiscais da Receita Estadual de MG</p>
        </header>

        <main>
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <CounterCard 
              value={daysSinceLastEvasion} 
              label="Dias sem perder um Auditor Fiscal"
              icon={<CalendarIcon />} 
            />
            <CounterCard 
              value={totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 
              label={`Custo estimado para o Estado com ${AUDITORS_WHO_LEFT_AFTER_POSSE} evasões pós-posse`}
              icon={<MoneyIcon />} 
            />
          </section>

          <section className="bg-slate-800 rounded-xl p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4">Destinos e Motivos da Evasão</h2>
            <p className="text-slate-400 mb-6">
              Esta tabela detalha os órgãos para os quais os auditores foram, ou os motivos pelos quais não tomaram posse. 
              O número total de evasões e desistências é de <span className="font-bold text-cyan-400">{totalEvasions}</span>.
            </p>
            <EvasionTable data={EVASION_DATA} />
          </section>
        </main>
        
        <footer className="text-center mt-12 text-slate-500 text-sm">
            <p>&copy; {new Date().getFullYear()} Observatório da Evasão. Dados simulados para fins de demonstração.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
