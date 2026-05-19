-- ============================================
-- รัน SQL นี้ใน Supabase → SQL Editor
-- ============================================

-- 1. Profiles (ข้อมูลส่วนตัว)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  age INTEGER,
  height_cm NUMERIC,
  gender TEXT CHECK (gender IN ('male','female')),
  goal TEXT DEFAULT 'fat_loss' CHECK (goal IN ('fat_loss','muscle_gain','maintenance')),
  activity_level TEXT DEFAULT 'moderate' CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
  sports TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. InBody Records (ประวัติผล InBody หลายครั้ง)
CREATE TABLE IF NOT EXISTS inbody_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  weight_kg NUMERIC,
  body_fat_pct NUMERIC,
  muscle_kg NUMERIC,
  fat_kg NUMERIC,
  bmi NUMERIC,
  visceral_fat INTEGER,
  inbody_score INTEGER,
  water_kg NUMERIC,
  protein_kg NUMERIC,
  bone_kg NUMERIC,
  ecw_ratio NUMERIC,
  image_url TEXT,
  input_method TEXT DEFAULT 'manual' CHECK (input_method IN ('manual','image')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Workout Logs (บันทึกการออกกำลังกาย - optional สำหรับ future)
CREATE TABLE IF NOT EXISTS workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  workout_type TEXT,
  duration_min INTEGER,
  notes TEXT
);

-- ============================================
-- Row Level Security (ป้องกันดูข้อมูลคนอื่น)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbody_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: ดูและแก้ไขได้เฉพาะของตัวเอง
CREATE POLICY "profiles_own" ON profiles
  FOR ALL USING (auth.uid() = id);

-- InBody: ดูและแก้ไขได้เฉพาะของตัวเอง
CREATE POLICY "inbody_own" ON inbody_records
  FOR ALL USING (auth.uid() = user_id);

-- Workout: ดูและแก้ไขได้เฉพาะของตัวเอง
CREATE POLICY "workout_own" ON workout_logs
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Auto-create profile เมื่อ User ใหม่สมัคร
-- ============================================

-- ============================================
-- Indexes (performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_inbody_user_id ON inbody_records(user_id);
CREATE INDEX IF NOT EXISTS idx_inbody_recorded_at ON inbody_records(user_id, recorded_at DESC);

-- ============================================
-- Auto-create profile เมื่อ User ใหม่สมัคร
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- Storage Policy (private bucket — users see only their own images)
-- ============================================

CREATE POLICY "storage_own_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'inbody-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage_own_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'inbody-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage_own_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'inbody-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
