import React, { createContext, useState } from 'react';

export const BankLedgerContext = createContext();

export const BankLedgerProvider = ({ children }) => {
  const [accountData, setAccountData] = useState({
    month: 'June 2025',
    openingBalance: 465,
    transactions: [],
    totals: {
      akbDr: 0,
      akbCr: 0,
      bill: 0,
      earning: 0,
      balance: 0
    }
  });

  const addTransaction = (transaction) => {
    setAccountData(prev => ({
      ...prev,
      transactions: [...prev.transactions, transaction]
    }));
  };

  return (
    <BankLedgerContext.Provider value={{ accountData, addTransaction }}>
      {children}
    </BankLedgerContext.Provider>
  );
};