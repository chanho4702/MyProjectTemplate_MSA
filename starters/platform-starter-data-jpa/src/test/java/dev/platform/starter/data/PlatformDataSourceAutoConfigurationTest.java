package dev.platform.starter.data;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class PlatformDataSourceAutoConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(PlatformDataSourceAutoConfiguration.class));

    @Test
    void missingFlagDoesNotCreatePools() {
        contextRunner.run(context -> assertThat(context).doesNotHaveBean("platformWriterDataSource"));
    }

    @Test
    void missingWriterUrlFailsFastWhenEnabled() {
        contextRunner
                .withPropertyValues("platform.datasource.enabled=true")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void missingReaderUsesASeparatePoolAgainstTheWriterEndpoint() {
        contextRunner
                .withPropertyValues(
                        "platform.datasource.enabled=true",
                        "platform.datasource.writer.url=jdbc:postgresql://db.example.test/app",
                        "platform.datasource.writer.username=app",
                        "platform.datasource.writer.password=secret"
                )
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    HikariDataSource writer = context.getBean("platformWriterDataSource", HikariDataSource.class);
                    HikariDataSource reader = context.getBean("platformReaderDataSource", HikariDataSource.class);
                    assertThat(writer.getJdbcUrl()).isEqualTo("jdbc:postgresql://db.example.test/app");
                    assertThat(reader.getJdbcUrl()).isEqualTo(writer.getJdbcUrl());
                    assertThat(context).hasBean("dataSource");
                });
    }
}
