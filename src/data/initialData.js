function dateOffset(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const initialData = {
  customers: [
    { id: 'c1', name: 'Aarav Mehta', phone: '+91 98765 43210', email: 'aarav.mehta@email.com', city: 'Mumbai', joined: dateOffset(-95) },
    { id: 'c2', name: 'Priya Sharma', phone: '+91 98201 76543', email: 'priya.s@email.com', city: 'Mumbai', joined: dateOffset(-80) },
    { id: 'c3', name: 'Ishaan Kapoor', phone: '+91 98190 22334', email: 'ishaan.k@email.com', city: 'Thane', joined: dateOffset(-66) },
    { id: 'c4', name: 'Ananya Iyer', phone: '+91 98920 11008', email: 'ananya.iyer@email.com', city: 'Mumbai', joined: dateOffset(-54) },
    { id: 'c5', name: 'Rohan Desai', phone: '+91 97690 65432', email: 'rohan.d@email.com', city: 'Navi Mumbai', joined: dateOffset(-41) },
    { id: 'c6', name: 'Meera Nair', phone: '+91 98670 55661', email: 'meera.nair@email.com', city: 'Mumbai', joined: dateOffset(-28) },
  ],
  measurements: [
    { id: 'm1', customerId: 'c1', customer: 'Aarav Mehta', garment: 'Formal shirt', date: dateOffset(-9), version: 2, values: { 'Neck': '15.5', 'Chest': '40', 'Waist': '34', 'Shoulder': '18', 'Sleeve': '25', 'Length': '29' } },
    { id: 'm2', customerId: 'c2', customer: 'Priya Sharma', garment: 'Blouse', date: dateOffset(-11), version: 1, values: { 'Bust': '34', 'Waist': '28', 'Shoulder': '14', 'Sleeve': '10', 'Length': '15', 'Armhole': '14' } },
    { id: 'm3', customerId: 'c3', customer: 'Ishaan Kapoor', garment: 'Two-piece suit', date: dateOffset(-14), version: 1, values: { 'Chest': '38', 'Waist': '32', 'Shoulder': '17', 'Sleeve': '24', 'Jacket length': '29', 'Inseam': '31' } },
  ],
  orders: [
    { id: 'TP-2408', customerId: 'c1', customer: 'Aarav Mehta', garment: 'Formal shirt', tailor: 'Dev Patel', dueDate: dateOffset(5), amount: 3200, advance: 1600, status: 'Stitching', createdAt: dateOffset(-1) },
    { id: 'TP-2407', customerId: 'c2', customer: 'Priya Sharma', garment: 'Silk blouse', tailor: 'Neha Joshi', dueDate: dateOffset(2), amount: 4800, advance: 2400, status: 'Quality Check', createdAt: dateOffset(-2) },
    { id: 'TP-2406', customerId: 'c3', customer: 'Ishaan Kapoor', garment: 'Two-piece suit', tailor: 'Dev Patel', dueDate: dateOffset(8), amount: 18500, advance: 9000, status: 'Assigned', createdAt: dateOffset(-3) },
    { id: 'TP-2405', customerId: 'c4', customer: 'Ananya Iyer', garment: 'Anarkali suit', tailor: 'Neha Joshi', dueDate: dateOffset(1), amount: 12500, advance: 5000, status: 'Ready', createdAt: dateOffset(-4) },
    { id: 'TP-2404', customerId: 'c5', customer: 'Rohan Desai', garment: 'Kurta & trouser', tailor: 'Arjun Singh', dueDate: dateOffset(11), amount: 6800, advance: 3400, status: 'Confirmed', createdAt: dateOffset(-5) },
    { id: 'TP-2403', customerId: 'c6', customer: 'Meera Nair', garment: 'Evening dress', tailor: 'Neha Joshi', dueDate: dateOffset(-1), amount: 9800, advance: 4900, status: 'Completed', createdAt: dateOffset(-8) },
  ],
  payments: [
    { id: 'p1', orderId: 'TP-2408', customer: 'Aarav Mehta', date: dateOffset(-1), amount: 1600, method: 'UPI', type: 'Advance' },
    { id: 'p2', orderId: 'TP-2407', customer: 'Priya Sharma', date: dateOffset(-2), amount: 2400, method: 'Card', type: 'Advance' },
    { id: 'p3', orderId: 'TP-2406', customer: 'Ishaan Kapoor', date: dateOffset(-3), amount: 9000, method: 'Cash', type: 'Advance' },
    { id: 'p4', orderId: 'TP-2405', customer: 'Ananya Iyer', date: dateOffset(-4), amount: 5000, method: 'UPI', type: 'Advance' },
    { id: 'p5', orderId: 'TP-2403', customer: 'Meera Nair', date: dateOffset(-6), amount: 4900, method: 'Bank transfer', type: 'Balance' },
  ],
  staff: [
    { id: 's1', name: 'Dev Patel', role: 'Master Tailor', phone: '+91 98203 11776', email: 'dev@tailorpro.in', active: true },
    { id: 's2', name: 'Neha Joshi', role: 'Senior Tailor', phone: '+91 98204 22318', email: 'neha@tailorpro.in', active: true },
    { id: 's3', name: 'Arjun Singh', role: 'Tailor', phone: '+91 98205 34521', email: 'arjun@tailorpro.in', active: true },
    { id: 's4', name: 'Kavita Rao', role: 'Finishing Specialist', phone: '+91 98206 45432', email: 'kavita@tailorpro.in', active: true },
  ],
  inventory: [
    { id: 'i1', name: 'Premium cotton — ivory', category: 'Fabric', sku: 'FAB-104', quantity: 42, unit: 'metres', reorderAt: 12, price: 480 },
    { id: 'i2', name: 'Italian wool — charcoal', category: 'Fabric', sku: 'FAB-208', quantity: 8, unit: 'metres', reorderAt: 10, price: 1850 },
    { id: 'i3', name: 'Mother-of-pearl buttons', category: 'Accessory', sku: 'ACC-032', quantity: 186, unit: 'pieces', reorderAt: 50, price: 18 },
    { id: 'i4', name: 'Invisible zip — 18 in', category: 'Accessory', sku: 'ACC-071', quantity: 24, unit: 'pieces', reorderAt: 30, price: 32 },
    { id: 'i5', name: 'Silk lining — champagne', category: 'Fabric', sku: 'FAB-319', quantity: 16, unit: 'metres', reorderAt: 8, price: 620 },
  ],
  settings: { businessName: 'Atelier TailorPro', owner: 'Yaman Renuka', email: 'hello@ateliertailorpro.com', phone: '+91 22 4567 8900', address: '24, Linking Road, Bandra West, Mumbai 400050', currency: 'INR', reminders: true, lowStockAlerts: true },
}
