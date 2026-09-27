// Koşu öncesi: hedef test yığını mı? Değilse HİÇBİR test başlamaz.
// Ardından önceki koşuların bıraktığı test kayıtları temizlenir; böylece
// her koşu aynı başlangıç durumundan başlar.
import { hedefDogrula, temizle } from './ortam.mjs';

export default async function () {
  hedefDogrula();
  temizle();
}
