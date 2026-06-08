
const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function makeDue(closing, dDay) {
  const d = new Date(closing.getFullYear(), closing.getMonth(), dDay);
  if (d <= closing) d.setMonth(d.getMonth() + 1);
  return d;
}

function test(now, cDay, dDay) {
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let closingDate = new Date(currentYear, currentMonth, cDay);
  // Current logic:
  let closingDateOld = new Date(currentYear, currentMonth, cDay);
  if (now > closingDateOld) {
    closingDateOld = new Date(currentYear, currentMonth + 1, cDay);
  }

  // Proposed logic:
  let closingDateNew = new Date(currentYear, currentMonth, cDay);
  const currentDue = makeDue(closingDateNew, dDay);
  if (now > currentDue) {
    closingDateNew = new Date(currentYear, currentMonth + 1, cDay);
  }

  const prevClosingOld = new Date(closingDateOld.getFullYear(), closingDateOld.getMonth() - 1, cDay);
  const prevClosingNew = new Date(closingDateNew.getFullYear(), closingDateNew.getMonth() - 1, cDay);

  console.log(`Now: ${now.toISOString().split('T')[0]}, Closing: ${cDay}, Due: ${dDay}`);
  console.log(`Old "Atual" ends: ${closingDateOld.toISOString().split('T')[0]} (Label: ${monthNames[closingDateOld.getMonth()]})`);
  console.log(`New "Atual" ends: ${closingDateNew.toISOString().split('T')[0]} (Label: ${monthNames[closingDateNew.getMonth()]})`);
  console.log('---');
}

console.log("Porto Bank case:");
test(new Date(2026, 5, 8), 3, 10); // June 8, 2026

console.log("Standard case (Closing 25, Due 5):");
test(new Date(2026, 5, 28), 25, 5); // June 28, 2026
test(new Date(2026, 6, 2), 25, 5); // July 2, 2026
test(new Date(2026, 6, 6), 25, 5); // July 6, 2026
