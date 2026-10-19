import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
})

export const registerSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z
    .string()
    .min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
    .regex(/[A-Z]/, "ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว")
    .regex(/[0-9]/, "ต้องมีตัวเลขอย่างน้อย 1 ตัว"),
  first_name: z.string().min(1, "กรุณากรอกชื่อ"),
  last_name: z.string().min(1, "กรุณากรอกนามสกุล"),
  phone: z.string().regex(/^[0-9]{10}$/, "เบอร์โทรต้องเป็นตัวเลข 10 หลัก"),
  address1: z.string().min(1, "กรุณากรอกที่อยู่"),
  address2: z.string().optional(),
  address3: z.string().min(1, "กรุณากรอกตำบล/แขวง"),
  address4: z.string().min(1, "กรุณากรอกอำเภอ/เขต"),
  address5: z.string().regex(/^[0-9]{5}$/, "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก"),
  address6: z.string().min(1, "กรุณากรอกจังหวัด/ประเทศ"),
})

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "กรุณากรอกรหัสผ่านปัจจุบัน"),
    new_password: z
      .string()
      .min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
      .regex(/[A-Z]/, "ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว")
      .regex(/[0-9]/, "ต้องมีตัวเลขอย่างน้อย 1 ตัว"),
    confirm_password: z.string().min(1, "กรุณายืนยันรหัสผ่าน"),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "รหัสผ่านไม่ตรงกัน",
    path: ["confirm_password"],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
