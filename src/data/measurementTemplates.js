export const measurementTemplates = [
  {
    group: 'Men',
    garments: [
      {
        name: 'Formal shirt',
        fields: ['Neck', 'Chest', 'Waist', 'Shoulder', 'Sleeve', 'Shirt length', 'Bicep', 'Cuff', 'Armhole', 'Front length', 'Back length', 'Wrist'],
      },
      {
        name: 'Trouser',
        fields: ['Waist', 'Hip', 'Thigh', 'Knee', 'Inseam', 'Outseam', 'Bottom', 'Front rise', 'Back rise', 'Crotch', 'Seat'],
      },
      {
        name: 'Two-piece suit',
        fields: ['Chest', 'Waist', 'Shoulder', 'Sleeve', 'Jacket length', 'Bicep', 'Armhole', 'Neck', 'Trouser waist', 'Hip', 'Thigh', 'Inseam', 'Outseam', 'Knee', 'Bottom'],
      },
      {
        name: 'Kurta',
        fields: ['Neck', 'Chest', 'Waist', 'Hip', 'Shoulder', 'Sleeve', 'Kurta length', 'Bicep', 'Cuff', 'Armhole', 'Side slit', 'Neck depth'],
      },
    ],
  },
  {
    group: 'Women',
    garments: [
      {
        name: 'Blouse',
        fields: ['Bust', 'Under bust', 'Waist', 'Shoulder', 'Sleeve', 'Blouse length', 'Armhole', 'Front neck depth', 'Back neck depth', 'Apex to apex', 'Apex to shoulder', 'Across back'],
      },
      {
        name: 'Suit',
        fields: ['Bust', 'Waist', 'Hip', 'Shoulder', 'Sleeve', 'Top length', 'Armhole', 'Neck', 'Front neck depth', 'Back neck depth', 'Trouser waist', 'Trouser hip', 'Inseam', 'Outseam'],
      },
      {
        name: 'Dress',
        fields: ['Bust', 'Under bust', 'Waist', 'Hip', 'Shoulder', 'Sleeve', 'Dress length', 'Armhole', 'Neck', 'Front neck depth', 'Back neck depth', 'Apex to waist', 'Across back'],
      },
    ],
  },
]

export const measurementFields = Object.fromEntries(
  measurementTemplates.flatMap(({ garments }) => garments.map(({ name, fields }) => [name, fields])),
)
