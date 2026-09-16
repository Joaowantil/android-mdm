# Regras prontas para quando isMinifyEnabled for ativado no build.gradle.kts.
#
# Por que isso importa: o Gson (usado pelo Retrofit pra serializar/desserializar
# os data classes de MDMApi.kt) usa reflection para casar o nome exato dos campos
# Kotlin com as chaves do JSON. Sem essas regras de "keep", o ProGuard/R8 renomeia
# os campos durante a ofuscação e o parsing do JSON quebra silenciosamente em
# produção (ex: heartbeat, enroll, apply_policy passam a falhar sem erro óbvio).
#
# NÃO ative isMinifyEnabled = true sem antes testar build de release completo
# num aparelho real, cobrindo pelo menos: enroll, heartbeat, comando de apply_policy
# e kiosk. Esta build não foi testada aqui (sem SDK Android disponível neste ambiente).

# Mantém todos os data classes de API (usados pelo Gson via reflection)
-keep class com.mdm.agent.services.EnrollRequest { *; }
-keep class com.mdm.agent.services.EnrollResponse { *; }
-keep class com.mdm.agent.services.HeartbeatRequest { *; }
-keep class com.mdm.agent.services.HeartbeatResponse { *; }
-keep class com.mdm.agent.services.PendingCommand { *; }
-keep class com.mdm.agent.services.LocationUpdate { *; }
-keep class com.mdm.agent.services.CommandAck { *; }

# Regras padrão recomendadas pelo próprio Retrofit/OkHttp/Gson
-dontwarn okhttp3.**
-dontwarn retrofit2.**
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class sun.misc.Unsafe { *; }
