import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testUpdate() {
  const reminderId = '34af623c-64b1-4ec7-95c4-2d9d653b0b27'
  const newAmount = 105.50
  const newNotes = 'RIC Ambiental - Teste Persistencia'

  console.log('Updating reminder ' + reminderId + ' to amount ' + newAmount)

  const { data, error } = await supabase
    .from('reminders')
    .update({ amount: newAmount, notes: newNotes })
    .eq('id', reminderId)
    .select()

  if (error) {
    console.error('Update failed:', error)
    process.exit(1)
  }

  console.log('Update result:', data)

  if (data && data[0].amount === newAmount && data[0].notes === newNotes) {
    console.log('SUCCESS: Values persisted correctly in DB.')
  } else {
    console.log('FAILURE: Values do not match. DB has amount: ' + (data ? data[0].amount : 'null'))
    process.exit(1)
  }
}

testUpdate()
